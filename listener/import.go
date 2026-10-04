package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

const importBatchSize = 500

// cacheEntry is one message in the whatscli message cache
// (~/Library/Application Support/whatscli/messages.json).
type cacheEntry struct {
	ID          string `json:"id"`
	ChatID      string `json:"chat_id"`
	SenderID    string `json:"sender_id"`
	ContactName string `json:"contact_name"`
	Timestamp   int64  `json:"ts"`
	Text        string `json:"text"`
	Kind        string `json:"kind"`
	Raw         string `json:"raw"`
}

// localDayRange returns [start of from, start of the day after to) in loc.
func localDayRange(from, to string, loc *time.Location) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation("2006-01-02", from, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid --from date: %w", err)
	}
	last, err := time.ParseInLocation("2006-01-02", to, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid --to date: %w", err)
	}
	end := last.AddDate(0, 0, 1)
	if !end.After(start) {
		return time.Time{}, time.Time{}, errors.New("--to must not be before --from")
	}
	return start, end, nil
}

// recordFromCache converts a cached message into a group message record using
// the same extraction as live messages.
func recordFromCache(secret []byte, entry cacheEntry) (MessageRecord, bool) {
	chat, err := types.ParseJID(entry.ChatID)
	if err != nil || chat.Server != types.GroupServer || entry.ID == "" {
		return MessageRecord{}, false
	}
	sender, err := types.ParseJID(entry.SenderID)
	if err != nil || sender.IsEmpty() {
		sender = types.NewJID("unknown", types.DefaultUserServer)
	}
	info := types.MessageInfo{
		MessageSource: types.MessageSource{Chat: chat, Sender: sender, IsGroup: true},
		ID:            types.MessageID(entry.ID),
		PushName:      entry.ContactName,
		Timestamp:     time.Unix(entry.Timestamp, 0).UTC(),
	}

	var msg *waE2E.Message
	if entry.Raw != "" {
		if data, err := base64.StdEncoding.DecodeString(entry.Raw); err == nil {
			raw := &waE2E.Message{}
			if proto.Unmarshal(data, raw) == nil {
				evt := &events.Message{Info: info, RawMessage: raw}
				msg = evt.UnwrapRaw().Message
			}
		}
	}
	if msg == nil && entry.Kind == "text" && !strings.HasPrefix(strings.TrimSpace(entry.Text), "[") {
		msg = &waE2E.Message{Conversation: proto.String(entry.Text)}
	}
	if msg == nil || msg.GetProtocolMessage() != nil || msg.GetReactionMessage() != nil {
		return MessageRecord{}, false
	}
	return recordFromMessage(secret, info, msg, "")
}

type importPayload struct {
	GroupJID        string          `json:"group_jid"`
	MessageID       string          `json:"message_id"`
	SenderHash      string          `json:"sender_hash"`
	SenderName      string          `json:"sender_name"`
	SentAt          time.Time       `json:"sent_at"`
	Body            string          `json:"body"`
	Contacts        []SharedContact `json:"contacts"`
	QuotedMessageID string          `json:"quoted_message_id"`
}

func (r *PostgresRecorder) ImportMessages(ctx context.Context, records []MessageRecord) (inserted, duplicates, disabled int, err error) {
	payload := make([]importPayload, 0, len(records))
	for _, record := range records {
		contacts := record.Contacts
		if contacts == nil {
			contacts = []SharedContact{}
		}
		payload = append(payload, importPayload{
			GroupJID: record.GroupJID, MessageID: record.MessageID, SenderHash: record.SenderHash,
			SenderName: record.SenderName, SentAt: record.SentAt, Body: record.Body,
			Contacts: contacts, QuotedMessageID: record.QuotedMessageID,
		})
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return 0, 0, 0, err
	}
	err = r.pool.QueryRow(ctx, `SELECT inserted, duplicates, disabled FROM public.import_group_messages($1::jsonb)`, string(data)).
		Scan(&inserted, &duplicates, &disabled)
	return inserted, duplicates, disabled, err
}

func defaultCachePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Application Support", "whatscli", "messages.json")
}

// importHistory loads group messages from the whatscli cache for a date range
// and imports them as backfill. Re-running it is safe.
func importHistory(ctx context.Context, cfg config, args []string) error {
	flags := flag.NewFlagSet("import", flag.ContinueOnError)
	cachePath := flags.String("cache", defaultCachePath(), "path to the whatscli messages.json cache")
	from := flags.String("from", "", "first local date to import (YYYY-MM-DD)")
	to := flags.String("to", "", "last local date to import, inclusive (YYYY-MM-DD)")
	zone := flags.String("timezone", "America/Costa_Rica", "time zone for the dates")
	dryRun := flags.Bool("dry-run", false, "count messages without importing")
	if err := flags.Parse(args); err != nil {
		return err
	}
	loc, err := time.LoadLocation(*zone)
	if err != nil {
		return fmt.Errorf("load time zone: %w", err)
	}
	start, end, err := localDayRange(*from, *to, loc)
	if err != nil {
		return err
	}

	file, err := os.Open(*cachePath)
	if err != nil {
		return fmt.Errorf("open cache: %w", err)
	}
	var entries []cacheEntry
	err = json.NewDecoder(file).Decode(&entries)
	file.Close()
	if err != nil {
		return fmt.Errorf("read cache: %w", err)
	}

	records := []MessageRecord{}
	for _, entry := range entries {
		sentAt := time.Unix(entry.Timestamp, 0)
		if sentAt.Before(start) || !sentAt.Before(end) {
			continue
		}
		if record, ok := recordFromCache(cfg.secret, entry); ok {
			records = append(records, record)
		}
	}
	sort.Slice(records, func(i, j int) bool { return records[i].SentAt.Before(records[j].SentAt) })
	fmt.Printf("Found %d group messages with text or contact cards from %s to %s.\n", len(records), *from, *to)
	if *dryRun || len(records) == 0 {
		return nil
	}

	recorder, err := NewPostgresRecorder(ctx, cfg.databaseURL)
	if err != nil {
		return err
	}
	defer recorder.Close()
	var inserted, duplicates, disabled int
	for offset := 0; offset < len(records); offset += importBatchSize {
		batch := records[offset:min(offset+importBatchSize, len(records))]
		i, d, x, err := recorder.ImportMessages(ctx, batch)
		if err != nil {
			return fmt.Errorf("import batch at %d: %w", offset, err)
		}
		inserted, duplicates, disabled = inserted+i, duplicates+d, disabled+x
	}
	fmt.Printf("Imported %d new messages; %d were already stored; %d belong to groups that aren't enabled.\n",
		inserted, duplicates, disabled)
	return nil
}
