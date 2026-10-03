package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// Recorder persists group activity. The listener role can only execute the
// narrow functions defined in the group digest migration.
type Recorder interface {
	UpsertGroup(ctx context.Context, jid, name string) error
	RecordMessage(ctx context.Context, record MessageRecord) (bool, error)
	ApplyChange(ctx context.Context, change MessageChange) error
	RecordStatus(ctx context.Context, status, accountPhone string) error
}

type PostgresRecorder struct {
	pool *pgxpool.Pool
}

func NewPostgresRecorder(ctx context.Context, databaseURL string) (*PostgresRecorder, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &PostgresRecorder{pool: pool}, nil
}

func (r *PostgresRecorder) Close() { r.pool.Close() }

func (r *PostgresRecorder) UpsertGroup(ctx context.Context, jid, name string) error {
	_, err := r.pool.Exec(ctx, `SELECT public.upsert_whatsapp_group($1, NULLIF($2, ''))`, jid, name)
	return err
}

func (r *PostgresRecorder) RecordMessage(ctx context.Context, record MessageRecord) (bool, error) {
	contacts := record.Contacts
	if contacts == nil {
		contacts = []SharedContact{}
	}
	contactsJSON, err := json.Marshal(contacts)
	if err != nil {
		return false, err
	}
	var stored bool
	err = r.pool.QueryRow(ctx, `SELECT public.record_group_message($1, NULLIF($2, ''), $3, $4, NULLIF($5, ''), $6, $7, $8::jsonb, NULLIF($9, ''))`,
		record.GroupJID, record.GroupName, record.MessageID, record.SenderHash, record.SenderName,
		record.SentAt, record.Body, string(contactsJSON), record.QuotedMessageID,
	).Scan(&stored)
	return stored, err
}

func (r *PostgresRecorder) ApplyChange(ctx context.Context, change MessageChange) error {
	if change.Revoked {
		_, err := r.pool.Exec(ctx, `SELECT public.revoke_group_message($1, $2)`, change.GroupJID, change.MessageID)
		return err
	}
	_, err := r.pool.Exec(ctx, `SELECT public.edit_group_message($1, $2, $3)`, change.GroupJID, change.MessageID, change.Body)
	return err
}

func (r *PostgresRecorder) RecordStatus(ctx context.Context, status, accountPhone string) error {
	_, err := r.pool.Exec(ctx, `SELECT public.record_listener_status($1, NULLIF($2, ''))`, status, accountPhone)
	return err
}

// openSessionStore keeps the whatsmeow linked-device session in the private
// whatsmeow schema so it survives redeploys without local disk.
func openSessionStore(ctx context.Context, databaseURL string, log waLog.Logger) (*sqlstore.Container, *sql.DB, error) {
	config, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("parse database URL: %w", err)
	}
	db := stdlib.OpenDB(*config, stdlib.OptionAfterConnect(func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET search_path TO whatsmeow")
		return err
	}))
	db.SetMaxOpenConns(4)
	container := sqlstore.NewWithDB(db, "postgres", log)
	if err := container.Upgrade(ctx); err != nil {
		db.Close()
		return nil, nil, fmt.Errorf("prepare session store: %w", err)
	}
	return container, db, nil
}
