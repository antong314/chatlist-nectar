package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
)

const (
	maxBodyLength  = 8000
	maxVcardLength = 4000
	maxNameLength  = 100
)

// SharedContact is a contact card shared in a group. The server parses the
// vCard with the same parser Machu uses for forwarded cards.
type SharedContact struct {
	Name  string `json:"name"`
	Vcard string `json:"vcard"`
	// Quoted marks a card copied from the message this one replies to. The
	// original card message may be missing (for example from desktop-client
	// history), and the reply is often the recommendation.
	Quoted bool `json:"quoted,omitempty"`
}

// MessageRecord is what the listener stores for one group message.
type MessageRecord struct {
	GroupJID        string
	GroupName       string
	MessageID       string
	SenderHash      string
	SenderName      string
	SenderPhone     string // private; used only when a member advertises their own service
	SentAt          time.Time
	Body            string
	Contacts        []SharedContact
	QuotedMessageID string
}

// MessageChange is an edit or deletion of an earlier group message.
type MessageChange struct {
	GroupJID  string
	MessageID string
	Revoked   bool
	Body      string
}

func truncate(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len([]rune(value)) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}

// phoneFromJID returns an E.164 number for a phone-number JID, or "".
func phoneFromJID(jid types.JID) string {
	if jid.Server != types.DefaultUserServer || len(jid.User) < 8 || len(jid.User) > 15 {
		return ""
	}
	for _, digit := range jid.User {
		if digit < '0' || digit > '9' {
			return ""
		}
	}
	return "+" + jid.User
}

// hashSender returns a stable pseudonymous identifier for a group member.
func hashSender(secret []byte, sender types.JID) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(sender.ToNonAD().String()))
	return hex.EncodeToString(mac.Sum(nil))
}

// messageText returns the human-readable text of a message, including media
// captions and shared locations. It returns "" for messages without text.
func messageText(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if text := msg.GetConversation(); text != "" {
		return text
	}
	if text := msg.GetExtendedTextMessage().GetText(); text != "" {
		return text
	}
	if caption := msg.GetImageMessage().GetCaption(); caption != "" {
		return caption
	}
	if caption := msg.GetVideoMessage().GetCaption(); caption != "" {
		return caption
	}
	if doc := msg.GetDocumentMessage(); doc != nil {
		parts := []string{}
		if caption := doc.GetCaption(); caption != "" {
			parts = append(parts, caption)
		}
		if title := doc.GetTitle(); title != "" {
			parts = append(parts, fmt.Sprintf("[document: %s]", title))
		}
		return strings.Join(parts, " ")
	}
	if location := msg.GetLocationMessage(); location != nil {
		parts := []string{"[location]"}
		if name := location.GetName(); name != "" {
			parts = append(parts, name)
		}
		if address := location.GetAddress(); address != "" {
			parts = append(parts, address)
		}
		if url := location.GetURL(); url != "" {
			parts = append(parts, url)
		}
		parts = append(parts, fmt.Sprintf("(%.6f, %.6f)", location.GetDegreesLatitude(), location.GetDegreesLongitude()))
		return strings.Join(parts, " ")
	}
	return ""
}

// contextInfo returns the reply context of a message, if any.
func contextInfo(msg *waE2E.Message) *waE2E.ContextInfo {
	if msg == nil {
		return nil
	}
	for _, info := range []*waE2E.ContextInfo{
		msg.GetExtendedTextMessage().GetContextInfo(),
		msg.GetImageMessage().GetContextInfo(),
		msg.GetVideoMessage().GetContextInfo(),
		msg.GetDocumentMessage().GetContextInfo(),
		msg.GetContactMessage().GetContextInfo(),
		msg.GetContactsArrayMessage().GetContextInfo(),
		msg.GetLocationMessage().GetContextInfo(),
	} {
		if info.GetStanzaID() != "" {
			return info
		}
	}
	return nil
}

func cardsIn(msg *waE2E.Message, quoted bool) []SharedContact {
	contacts := []SharedContact{}
	add := func(card *waE2E.ContactMessage) {
		if card == nil || strings.TrimSpace(card.GetVcard()) == "" {
			return
		}
		contacts = append(contacts, SharedContact{
			Name:   truncate(card.GetDisplayName(), maxNameLength),
			Vcard:  truncate(card.GetVcard(), maxVcardLength),
			Quoted: quoted,
		})
	}
	add(msg.GetContactMessage())
	for _, card := range msg.GetContactsArrayMessage().GetContacts() {
		add(card)
	}
	return contacts
}

// sharedContacts returns the contact cards attached to a message, followed by
// any cards in the message it replies to.
func sharedContacts(msg *waE2E.Message) []SharedContact {
	if msg == nil {
		return nil
	}
	contacts := cardsIn(msg, false)
	if quoted := contextInfo(msg).GetQuotedMessage(); quoted != nil {
		contacts = append(contacts, cardsIn(quoted, true)...)
	}
	return contacts
}

// quotedMessageID returns the ID of the message this one replies to.
func quotedMessageID(msg *waE2E.Message) string {
	return contextInfo(msg).GetStanzaID()
}

// recordFromMessage converts a decrypted group message into a record. It
// returns ok=false for messages that carry nothing the digest can use.
func recordFromMessage(secret []byte, info types.MessageInfo, msg *waE2E.Message, groupName string) (MessageRecord, bool) {
	if info.Chat.Server != types.GroupServer || info.IsFromMe || msg == nil {
		return MessageRecord{}, false
	}
	record := MessageRecord{
		GroupJID:        info.Chat.ToNonAD().String(),
		GroupName:       groupName,
		MessageID:       string(info.ID),
		SenderHash:      hashSender(secret, info.Sender),
		SenderName:      truncate(info.PushName, maxNameLength),
		SenderPhone:     firstNonEmpty(phoneFromJID(info.Sender.ToNonAD()), phoneFromJID(info.SenderAlt.ToNonAD())),
		SentAt:          info.Timestamp,
		Body:            truncate(messageText(msg), maxBodyLength),
		Contacts:        sharedContacts(msg),
		QuotedMessageID: quotedMessageID(msg),
	}
	if record.SentAt.IsZero() {
		record.SentAt = time.Now()
	}
	if record.MessageID == "" || (record.Body == "" && len(record.Contacts) == 0) {
		return MessageRecord{}, false
	}
	return record, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

// changeFromMessage recognizes edits and deletions of earlier group messages.
func changeFromMessage(info types.MessageInfo, msg *waE2E.Message) (MessageChange, bool) {
	if info.Chat.Server != types.GroupServer {
		return MessageChange{}, false
	}
	protocol := msg.GetProtocolMessage()
	if protocol == nil || protocol.GetKey().GetID() == "" {
		return MessageChange{}, false
	}
	change := MessageChange{GroupJID: info.Chat.ToNonAD().String(), MessageID: protocol.GetKey().GetID()}
	switch protocol.GetType() {
	case waE2E.ProtocolMessage_REVOKE:
		change.Revoked = true
		return change, true
	case waE2E.ProtocolMessage_MESSAGE_EDIT:
		change.Body = truncate(messageText(protocol.GetEditedMessage()), maxBodyLength)
		return change, true
	}
	return MessageChange{}, false
}
