package main

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

const (
	writeTimeout     = 15 * time.Second
	groupInfoTimeout = 10 * time.Second
)

// Listener records group messages. It never sends messages, reactions, read
// receipts, or presence updates.
type Listener struct {
	client   *whatsmeow.Client
	recorder Recorder
	secret   []byte
	log      *slog.Logger

	mu         sync.Mutex
	groupNames map[types.JID]string

	// StreamReplaced is signalled when another session takes over this device.
	streamReplaced chan struct{}
	loggedOut      chan struct{}
}

func NewListener(client *whatsmeow.Client, recorder Recorder, secret []byte, log *slog.Logger) *Listener {
	listener := &Listener{
		client:         client,
		recorder:       recorder,
		secret:         secret,
		log:            log,
		groupNames:     map[types.JID]string{},
		streamReplaced: make(chan struct{}, 1),
		loggedOut:      make(chan struct{}, 1),
	}
	client.AddEventHandler(listener.handle)
	return listener
}

func (l *Listener) accountPhone() string {
	if l.client.Store == nil || l.client.Store.ID == nil {
		return ""
	}
	return "+" + l.client.Store.ID.User
}

func (l *Listener) recordStatus(status string) {
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	if err := l.recorder.RecordStatus(ctx, status, l.accountPhone()); err != nil {
		l.log.Warn("could not record listener status", "status", status, "error", err)
	}
}

func notify(ch chan struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

func (l *Listener) handle(rawEvent any) {
	switch evt := rawEvent.(type) {
	case *events.Message:
		l.handleMessage(evt, "")
	case *events.HistorySync:
		l.handleHistorySync(evt)
	case *events.JoinedGroup:
		l.rememberGroup(evt.JID, evt.GroupName.Name)
	case *events.GroupInfo:
		if evt.Name != nil {
			l.rememberGroup(evt.JID, evt.Name.Name)
		}
	case *events.Connected:
		l.log.Info("connected to WhatsApp", "account", l.accountPhone())
		l.recordStatus("connected")
	case *events.Disconnected:
		l.log.Warn("disconnected from WhatsApp")
		l.recordStatus("disconnected")
	case *events.LoggedOut:
		l.log.Error("logged out of WhatsApp; a new login is required", "reason", evt.Reason.String())
		l.recordStatus("logged_out")
		notify(l.loggedOut)
	case *events.StreamReplaced:
		l.log.Warn("another session replaced this connection")
		l.recordStatus("disconnected")
		notify(l.streamReplaced)
	case *events.TemporaryBan:
		l.log.Error("WhatsApp temporarily banned this account", "detail", evt.String())
		l.recordStatus("disconnected")
	case *events.ConnectFailure:
		l.log.Error("WhatsApp connection failed", "reason", evt.Reason.String(), "message", evt.Message)
	}
}

func (l *Listener) rememberGroup(jid types.JID, name string) {
	jid = jid.ToNonAD()
	if jid.Server != types.GroupServer {
		return
	}
	l.mu.Lock()
	if name != "" {
		l.groupNames[jid] = name
	}
	l.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	if err := l.recorder.UpsertGroup(ctx, jid.String(), name); err != nil {
		l.log.Warn("could not record group", "group", jid.String(), "error", err)
	}
}

// groupName returns a cached group name, asking WhatsApp once per group.
func (l *Listener) groupName(jid types.JID, hint string) string {
	jid = jid.ToNonAD()
	l.mu.Lock()
	if hint != "" {
		l.groupNames[jid] = hint
	}
	name, known := l.groupNames[jid]
	l.mu.Unlock()
	if known {
		return name
	}
	ctx, cancel := context.WithTimeout(context.Background(), groupInfoTimeout)
	defer cancel()
	info, err := l.client.GetGroupInfo(ctx, jid)
	if err != nil {
		l.log.Warn("could not load group name", "group", jid.String(), "error", err)
		return ""
	}
	l.mu.Lock()
	l.groupNames[jid] = info.Name
	l.mu.Unlock()
	return info.Name
}

func (l *Listener) handleMessage(evt *events.Message, groupNameHint string) {
	if evt == nil || evt.Info.Chat.Server != types.GroupServer {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
	defer cancel()
	if change, ok := changeFromMessage(evt.Info, evt.Message); ok {
		if err := l.recorder.ApplyChange(ctx, change); err != nil {
			l.log.Warn("could not apply message change", "group", change.GroupJID, "error", err)
		}
		return
	}
	record, ok := recordFromMessage(l.secret, evt.Info, evt.Message, "")
	if !ok {
		return
	}
	record.GroupName = l.groupName(evt.Info.Chat, groupNameHint)
	stored, err := l.recorder.RecordMessage(ctx, record)
	if err != nil {
		l.log.Warn("could not record message", "group", record.GroupJID, "error", err)
		return
	}
	if stored {
		l.log.Debug("recorded group message", "group", record.GroupJID)
	}
}

func (l *Listener) handleHistorySync(evt *events.HistorySync) {
	if evt == nil || evt.Data == nil {
		return
	}
	recorded := 0
	for _, conversation := range evt.Data.GetConversations() {
		chatJID, err := types.ParseJID(conversation.GetID())
		if err != nil || chatJID.Server != types.GroupServer {
			continue
		}
		name := conversation.GetName()
		l.rememberGroup(chatJID, name)
		for _, historyMessage := range conversation.GetMessages() {
			webMessage := historyMessage.GetMessage()
			if webMessage == nil {
				continue
			}
			parsed, err := l.client.ParseWebMessage(chatJID, webMessage)
			if err != nil {
				continue
			}
			l.handleMessage(parsed, name)
			recorded++
		}
	}
	l.log.Info("processed history sync", "type", evt.Data.GetSyncType().String(), "messages", recorded)
}
