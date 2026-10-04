package main

import (
	"encoding/base64"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

func rawEntry(t *testing.T, msg *waE2E.Message) string {
	t.Helper()
	data, err := proto.Marshal(msg)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(data)
}

func TestRecordFromCacheUsesRawMessage(t *testing.T) {
	entry := cacheEntry{
		ID: "H1", ChatID: "120363000000000001@g.us", SenderID: "123@lid", ContactName: "Eve",
		Timestamp: 1759500000, Kind: "text", Text: "ignored",
		Raw: rawEntry(t, &waE2E.Message{EphemeralMessage: &waE2E.FutureProofMessage{Message: &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text:        proto.String("Luis does gardening, 8690-3015"),
				ContextInfo: &waE2E.ContextInfo{StanzaID: proto.String("Q1")},
			},
		}}}),
	}
	record, ok := recordFromCache(testSecret, entry)
	if !ok || record.Body != "Luis does gardening, 8690-3015" || record.QuotedMessageID != "Q1" || record.SenderName != "Eve" {
		t.Fatalf("unexpected record: %+v ok=%v", record, ok)
	}
	if !record.SentAt.Equal(time.Unix(1759500000, 0)) {
		t.Fatalf("unexpected time: %v", record.SentAt)
	}
}

func TestRecordFromCacheFallsBackToTextAndSkipsPlaceholders(t *testing.T) {
	base := cacheEntry{ID: "H2", ChatID: "120363000000000001@g.us", SenderID: "123@lid", Timestamp: 1759500000}
	text := base
	text.Kind, text.Text = "text", "Market moved to Saturdays"
	if record, ok := recordFromCache(testSecret, text); !ok || record.Body != "Market moved to Saturdays" {
		t.Fatalf("text fallback failed: %+v", record)
	}
	image := base
	image.Kind, image.Text = "image", "[IMAGE]"
	if _, ok := recordFromCache(testSecret, image); ok {
		t.Fatal("uncaptioned images must be skipped")
	}
	direct := text
	direct.ChatID = "50688887777@s.whatsapp.net"
	if _, ok := recordFromCache(testSecret, direct); ok {
		t.Fatal("direct chats must be skipped")
	}
}

func TestLocalDayRangeIsInclusive(t *testing.T) {
	loc, _ := time.LoadLocation("America/Costa_Rica")
	start, end, err := localDayRange("2026-09-27", "2026-10-03", loc)
	if err != nil {
		t.Fatal(err)
	}
	if start.UTC().Format(time.RFC3339) != "2026-09-27T06:00:00Z" || end.UTC().Format(time.RFC3339) != "2026-10-04T06:00:00Z" {
		t.Fatalf("unexpected range %v – %v", start.UTC(), end.UTC())
	}
	if _, _, err := localDayRange("2026-10-03", "2026-09-27", loc); err == nil {
		t.Fatal("expected an error for a reversed range")
	}
}

func TestRecordFromCacheKeepsSenderPhone(t *testing.T) {
	entry := cacheEntry{ID: "H9", ChatID: "120363000000000001@g.us", SenderID: "50663804288@s.whatsapp.net",
		Timestamp: 1759500000, Kind: "text", Text: "Shiatsu sessions this week, DM me"}
	record, ok := recordFromCache(testSecret, entry)
	if !ok || record.SenderPhone != "+50663804288" {
		t.Fatalf("unexpected sender phone: %+v", record)
	}
}
