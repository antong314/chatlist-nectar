# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/95cc3dae-9f23-4461-b96d-6dda7dc2347c

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/95cc3dae-9f23-4461-b96d-6dda7dc2347c) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

## ⚠️ IMPORTANT DEVELOPMENT NOTES ⚠️

### Port Requirements
- **ALWAYS run the development server on port 8080**
- Before restarting the server, make sure to kill any processes using port 8080
- Use the following command to kill processes on port 8080: `lsof -ti:8080 | xargs kill -9`
- The dev script in package.json is configured to use port 8080

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Configure Supabase for the wiki feature.
# Copy .env.example to .env and set your Supabase credentials.
cp .env.example .env

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

## Supabase Integration

This project now includes a Wiki feature that integrates with Supabase for data storage.

### Setting up Supabase

1. [Create a Supabase account](https://supabase.com) if you don't have one already
2. Create a new Supabase project
3. Set up the database using the SQL script in `database/wiki_setup.sql`
4. Configure your environment variables in `.env`

For detailed setup instructions, refer to the [Supabase Setup Guide](docs/SUPABASE_SETUP.md) in the docs folder.

### Wiki Features

- Create and edit wiki pages with a rich text editor
- Store wiki content in a PostgreSQL database via Supabase
- Browse and search wiki pages
- Export pages for sharing

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with .

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/95cc3dae-9f23-4461-b96d-6dda7dc2347c) and click on Share -> Publish.

## I want to use a custom domain - is that possible?

We don't support custom domains (yet). If you want to deploy your project under your own domain then we recommend using Netlify. Visit our docs for more details: [Custom domains](https://docs.lovable.dev/tips-tricks/custom-domain/)
