# Supabase Setup Guide for Chatlist Nectar

This guide explains how to set up Supabase for the Chatlist Nectar application, specifically for the Wiki feature.

## Prerequisites

1. [Create a Supabase account](https://supabase.com) if you don't have one already
2. Create a new Supabase project

## Setting Up Environment Variables

1. Copy the `.env.example` file to create a `.env` file in the project root
2. Fill in your Supabase URL and anonymous key:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

You can find these values in your Supabase project dashboard under Project Settings > API.

## Database Setup

### Option 1: Using the SQL Editor in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy and paste the contents of `database/wiki_setup.sql` into the editor
5. Run the query

### Option 2: Using the Supabase CLI

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli)
2. Run the SQL script using the CLI:

```bash
supabase db execute -f database/wiki_setup.sql
```

## Table Structure

The Wiki feature uses the following table:

### wiki_pages

| Column       | Type                  | Description                                |
|--------------|------------------------|-------------------------------------------|
| id           | UUID                  | Primary key, auto-generated                |
| slug         | TEXT                  | URL-friendly identifier (unique)           |
| title        | TEXT                  | Title of the wiki page                     |
| content      | TEXT                  | Content of the wiki page (JSON format)     |
| excerpt      | TEXT                  | Short summary of the page content          |
| created_at   | TIMESTAMP WITH TZ     | When the page was created                  |
| updated_at   | TIMESTAMP WITH TZ     | When the page was last updated             |
| created_by   | UUID                  | Reference to the auth.users table (optional)|
| is_published | BOOLEAN               | Whether the page is published              |

## Row Level Security (RLS)

The SQL setup script includes Row Level Security policies that:

1. Allow anyone to read published pages
2. Allow authenticated users to create, update, and delete pages

## Testing the Setup

After setting up Supabase:

1. Start the application with `npm run dev`
2. Navigate to the Wiki section
3. Try creating, viewing, editing, and deleting wiki pages to ensure the Supabase integration is working correctly

## Troubleshooting

- If you encounter CORS issues, verify your Supabase project's API settings
- Check the browser console for error messages
- Ensure your environment variables are correctly set in the `.env` file
