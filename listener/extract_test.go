package main

import (
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

var (
	testSecret = []byte("test-secret")
	testGroup  = types.NewJID("120363000000000001", types.GroupServer)
	testSender = types.NewJID("123456789", types.HiddenUserServer)
)

func groupInfo(id string) types.MessageInfo {
	return types.MessageInfo{
		MessageSource: types.MessageSource{Chat: testGroup, Sender: testSender, IsGroup: true},
		ID:            types.MessageID(id),
		PushName:      " Ana ",
		Timestamp:     time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC),
	}
}

func TestRecordFromTextReply(t *testing.T) {
	msg := &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{
		Text:        proto.String("Call José, 8888-7777, he fixed our roof"),
		ContextInfo: &waE2E.ContextInfo{StanzaID: proto.String("QUESTION1")},
	}}
	record, ok := recordFromMessage(testSecret, groupInfo("M1"), msg, "Neighbors")
	if !ok {
		t.Fatal("expected a record")
	}
	if record.Body != "Call José, 8888-7777, he fixed our roof" || record.QuotedMessageID != "QUESTION1" {
		t.Fatalf("unexpected record: %+v", record)
	}
	if record.SenderName != "Ana" || record.GroupJID != "120363000000000001@g.us" || record.GroupName != "Neighbors" {
		t.Fatalf("unexpected metadata: %+v", record)
	}
	if len(record.SenderHash) != 64 || record.SenderHash == testSender.String() {
		t.Fatalf("sender must be pseudonymous: %q", record.SenderHash)
	}
}

func TestRecordFromContactCards(t *testing.T) {
	vcard := "BEGIN:VCARD\nVERSION:3.0\nFN:Luis Gardener\nTEL;type=CELL:+506 8690 3015\nEND:VCARD"
	msg := &waE2E.Message{ContactsArrayMessage: &waE2E.ContactsArrayMessage{Contacts: []*waE2E.ContactMessage{
		{DisplayName: proto.String("Luis Gardener"), Vcard: proto.String(vcard)},
		{DisplayName: proto.String("Empty"), Vcard: proto.String("  ")},
	}}}
	record, ok := recordFromMessage(testSecret, groupInfo("M2"), msg, "")
	if !ok || len(record.Contacts) != 1 || record.Contacts[0].Name != "Luis Gardener" || record.Contacts[0].Vcard != vcard {
		t.Fatalf("unexpected contacts: %+v ok=%v", record.Contacts, ok)
	}
}

func TestRecordIgnoresDirectChatsOwnMessagesAndEmptyMedia(t *testing.T) {
	text := &waE2E.Message{Conversation: proto.String("hello")}
	direct := groupInfo("D1")
	direct.Chat = types.NewJID("50688887777", types.DefaultUserServer)
	if _, ok := recordFromMessage(testSecret, direct, text, ""); ok {
		t.Fatal("direct chats must be ignored")
	}
	own := groupInfo("O1")
	own.IsFromMe = true
	if _, ok := recordFromMessage(testSecret, own, text, ""); ok {
		t.Fatal("own messages must be ignored")
	}
	sticker := &waE2E.Message{StickerMessage: &waE2E.StickerMessage{}}
	if _, ok := recordFromMessage(testSecret, groupInfo("S1"), sticker, ""); ok {
		t.Fatal("messages without text or contacts must be ignored")
	}
}

func TestMessageTextCaptionsAndLocations(t *testing.T) {
	image := &waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String("New bakery menu")}}
	if got := messageText(image); got != "New bakery menu" {
		t.Fatalf("caption: %q", got)
	}
	location := &waE2E.Message{LocationMessage: &waE2E.LocationMessage{
		Name: proto.String("Feria"), Address: proto.String("Orotina"),
		DegreesLatitude: proto.Float64(9.9), DegreesLongitude: proto.Float64(-84.5),
	}}
	if got := messageText(location); got != "[location] Feria Orotina (9.900000, -84.500000)" {
		t.Fatalf("location: %q", got)
	}
}

func TestChangeFromRevokeAndEdit(t *testing.T) {
	revoke := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type: waE2E.ProtocolMessage_REVOKE.Enum(),
		Key:  &waCommon.MessageKey{ID: proto.String("M1")},
	}}
	change, ok := changeFromMessage(groupInfo("R1"), revoke)
	if !ok || !change.Revoked || change.MessageID != "M1" {
		t.Fatalf("unexpected revoke: %+v", change)
	}
	edit := &waE2E.Message{ProtocolMessage: &waE2E.ProtocolMessage{
		Type:          waE2E.ProtocolMessage_MESSAGE_EDIT.Enum(),
		Key:           &waCommon.MessageKey{ID: proto.String("M1")},
		EditedMessage: &waE2E.Message{Conversation: proto.String("Corrected: 8888-7778")},
	}}
	change, ok = changeFromMessage(groupInfo("E1"), edit)
	if !ok || change.Revoked || change.Body != "Corrected: 8888-7778" {
		t.Fatalf("unexpected edit: %+v", change)
	}
}

func TestHashSenderIgnoresDeviceSuffix(t *testing.T) {
	device := testSender
	device.Device = 3
	if hashSender(testSecret, device) != hashSender(testSecret, testSender) {
		t.Fatal("hash must be stable across a member's devices")
	}
}
