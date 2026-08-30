import assert from 'node:assert/strict';
import test from 'node:test';
import { DirectoryStore } from '../directory-store.mjs';

const contact = {
  id: '7bf39fa3-2c3e-4248-8ef4-6377274e44d1',
  title: 'Ana Taxi',
  subtitle: 'Airport rides',
  category: 'Taxi',
  phone_number: '+50688881212',
};

const audit = {
  requesterWhatsapp: '+50687184331',
  requesterName: 'María',
  twilioMessageSid: `SM${'1'.repeat(32)}`,
};

test('creates inbound contacts through the actor-recording RPC', async () => {
  let call;
  const store = new DirectoryStore({
    client: {
      rpc: async (name, args) => {
        call = { name, args };
        return { data: [{ ...contact, created: true }], error: null };
      },
    },
  });

  const result = await store.createOrGetContact({ name: contact.title, phone: contact.phone_number }, audit);

  assert.equal(call.name, 'upsert_inbound_provider_contact');
  assert.deepEqual(call.args, {
    p_name: contact.title,
    p_phone: contact.phone_number,
    p_requester_whatsapp: audit.requesterWhatsapp,
    p_requester_name: audit.requesterName,
    p_twilio_message_sid: audit.twilioMessageSid,
  });
  assert.equal(result.created, true);
});

test('records inbound description and category updates through the audited RPC', async () => {
  let call;
  const store = new DirectoryStore({
    client: {
      rpc: async (name, args) => {
        call = { name, args };
        return { data: [contact], error: null };
      },
    },
  });

  await store.updateContact(contact.id, {
    subtitle: 'Airport and local rides',
    category: 'Taxi',
    website_url: 'https://not-allowed.example',
  }, audit);

  assert.equal(call.name, 'update_inbound_provider_contact');
  assert.deepEqual(call.args, {
    p_contact_id: contact.id,
    p_changes: { subtitle: 'Airport and local rides', category: 'Taxi' },
    p_requester_whatsapp: audit.requesterWhatsapp,
    p_requester_name: audit.requesterName,
    p_twilio_message_sid: audit.twilioMessageSid,
  });
});
