// Command listener is Machu's read-only WhatsApp group listener. It links to a
// dedicated WhatsApp account as a companion device (like WhatsApp Web) and
// records messages from groups an administrator has enabled, for the daily
// group digest on the San Mateo Love server.
//
//	listener login [-phone +15551234567] [-qr-png qr.png]   link the account once
//	listener run                                            record messages (default)
//	listener import -from 2026-09-27 -to 2026-10-03         backfill from the whatscli cache
//
// Environment:
//
//	DATABASE_URL        Postgres connection string for the machu_listener role
//	SENDER_HASH_SECRET  secret used to pseudonymize group members
//	LOG_LEVEL           debug, info (default), warn, or error
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mdp/qrterminal/v3"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

const (
	heartbeatInterval  = 2 * time.Minute
	loginPollInterval  = time.Minute
	replacedRetryDelay = 2 * time.Minute
	deviceDisplayName  = "Machu Listener"
)

type config struct {
	databaseURL string
	secret      []byte
	log         *slog.Logger
}

func loadConfig() (config, error) {
	level := slog.LevelInfo
	switch strings.ToLower(os.Getenv("LOG_LEVEL")) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	cfg := config{
		databaseURL: os.Getenv("DATABASE_URL"),
		secret:      []byte(os.Getenv("SENDER_HASH_SECRET")),
		log:         slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})),
	}
	if cfg.databaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if len(cfg.secret) < 32 {
		return cfg, errors.New("SENDER_HASH_SECRET must be at least 32 characters")
	}
	return cfg, nil
}

func main() {
	command := "run"
	args := os.Args[1:]
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		command, args = args[0], args[1:]
	}
	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "listener:", err)
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch command {
	case "run":
		err = run(ctx, cfg)
	case "login":
		err = login(ctx, cfg, args)
	case "import":
		err = importHistory(ctx, cfg, args)
	default:
		err = fmt.Errorf("unknown command %q (use run, login, or import)", command)
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		cfg.log.Error("listener stopped", "error", err)
		os.Exit(1)
	}
}

func configureDevice() {
	store.DeviceProps.Os = proto.String(deviceDisplayName)
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_DESKTOP.Enum()
}

func whatsmeowLogger(cfg config) waLog.Logger {
	if strings.EqualFold(os.Getenv("LOG_LEVEL"), "debug") {
		return waLog.Stdout("whatsmeow", "DEBUG", false)
	}
	return waLog.Stdout("whatsmeow", "WARN", false)
}

func openRecorderAndStore(ctx context.Context, cfg config) (*PostgresRecorder, *sqlstore.Container, func(), error) {
	recorder, err := NewPostgresRecorder(ctx, cfg.databaseURL)
	if err != nil {
		return nil, nil, nil, err
	}
	container, db, err := openSessionStore(ctx, cfg.databaseURL, whatsmeowLogger(cfg))
	if err != nil {
		recorder.Close()
		return nil, nil, nil, err
	}
	cleanup := func() {
		db.Close()
		recorder.Close()
	}
	return recorder, container, cleanup, nil
}

// run records messages until the process is stopped. Without a linked device
// it waits for `listener login` to create one, so the worker can be deployed
// before the account is linked.
func run(ctx context.Context, cfg config) error {
	configureDevice()
	recorder, container, cleanup, err := openRecorderAndStore(ctx, cfg)
	if err != nil {
		return err
	}
	defer cleanup()

	for {
		device, err := container.GetFirstDevice(ctx)
		if err != nil {
			return fmt.Errorf("load linked device: %w", err)
		}
		if device.ID == nil {
			cfg.log.Warn("no linked WhatsApp account yet; run `listener login`")
			statusCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			_ = recorder.RecordStatus(statusCtx, "awaiting_login", "")
			cancel()
			if err := sleep(ctx, loginPollInterval); err != nil {
				return err
			}
			continue
		}
		outcome, err := runSession(ctx, cfg, device, recorder)
		if err != nil {
			return err
		}
		if outcome == "replaced" {
			if err := sleep(ctx, replacedRetryDelay); err != nil {
				return err
			}
		}
	}
}

func runSession(ctx context.Context, cfg config, device *store.Device, recorder Recorder) (string, error) {
	client := whatsmeow.NewClient(device, whatsmeowLogger(cfg))
	client.EnableAutoReconnect = true
	listener := NewListener(client, recorder, cfg.secret, cfg.log)
	listener.recordStatus("starting")
	if err := client.Connect(); err != nil {
		cfg.log.Warn("could not connect; retrying", "error", err)
		listener.recordStatus("disconnected")
		return "retry", sleep(ctx, loginPollInterval)
	}
	defer client.Disconnect()

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			listener.recordStatus("disconnected")
			return "", ctx.Err()
		case <-listener.loggedOut:
			return "logged_out", nil
		case <-listener.streamReplaced:
			return "replaced", nil
		case <-ticker.C:
			if client.IsConnected() {
				listener.recordStatus("connected")
			} else {
				listener.recordStatus("disconnected")
			}
		}
	}
}

// login links the dedicated WhatsApp account, either with a QR code or with a
// pairing code entered on the phone, then stays connected briefly so the
// initial group list and history sync are recorded.
func login(ctx context.Context, cfg config, args []string) error {
	flags := flag.NewFlagSet("login", flag.ContinueOnError)
	phone := flags.String("phone", "", "link with a pairing code for this phone number instead of a QR code")
	qrPNG := flags.String("qr-png", "", "also write each QR code to this PNG file")
	stay := flags.Duration("stay", 90*time.Second, "how long to stay connected after linking")
	if err := flags.Parse(args); err != nil {
		return err
	}
	configureDevice()
	recorder, container, cleanup, err := openRecorderAndStore(ctx, cfg)
	if err != nil {
		return err
	}
	defer cleanup()

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		return fmt.Errorf("load linked device: %w", err)
	}
	if device.ID != nil {
		fmt.Printf("Already linked as +%s. Unlink it from the phone first to link a different account.\n", device.ID.User)
		return nil
	}

	client := whatsmeow.NewClient(device, whatsmeowLogger(cfg))
	listener := NewListener(client, recorder, cfg.secret, cfg.log)
	qrChannel, err := client.GetQRChannel(ctx)
	if err != nil {
		return fmt.Errorf("start login: %w", err)
	}
	if err := client.Connect(); err != nil {
		return fmt.Errorf("connect to WhatsApp: %w", err)
	}
	defer client.Disconnect()

	paired := false
	for item := range qrChannel {
		switch item.Event {
		case whatsmeow.QRChannelEventCode:
			if *phone != "" {
				if paired {
					continue
				}
				code, err := client.PairPhone(ctx, strings.TrimPrefix(*phone, "+"), true, whatsmeow.PairClientChrome, "Chrome (Linux)")
				if err != nil {
					return fmt.Errorf("request pairing code: %w", err)
				}
				paired = true
				fmt.Printf("\nOn the listener phone: WhatsApp → Linked devices → Link a device → Link with phone number instead\nEnter this code: %s\n\n", code)
				continue
			}
			fmt.Println("\nScan this QR code from the listener phone: WhatsApp → Linked devices → Link a device")
			qrterminal.GenerateHalfBlock(item.Code, qrterminal.L, os.Stdout)
			if *qrPNG != "" {
				if err := qrcode.WriteFile(item.Code, qrcode.Medium, 512, *qrPNG); err != nil {
					cfg.log.Warn("could not write QR image", "error", err)
				}
			}
		case "success":
			fmt.Printf("Linked as %s. Recording the initial group list for %s…\n", listener.accountPhone(), stay.String())
			listener.recordStatus("connected")
			if err := sleep(ctx, *stay); err != nil {
				return err
			}
			listener.recordStatus("disconnected")
			fmt.Println("Done. The deployed listener will take over from here.")
			return nil
		case "timeout":
			return errors.New("login timed out; run the command again")
		default:
			if item.Error != nil {
				return fmt.Errorf("login failed: %w", item.Error)
			}
			cfg.log.Info("login event", "event", item.Event)
		}
	}
	return errors.New("login ended without linking")
}

func sleep(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
