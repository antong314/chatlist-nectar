// Mock data for wiki pages - in a real app this would come from an API
import { WikiPage } from "../types";

export const mockPages: Record<string, WikiPage> = {
  'welcome': {
    id: 'welcome',
    slug: 'welcome',
    title: 'Welcome to the Machuca Wiki',
    created_at: new Date('2023-01-01').toISOString(),
    updated_at: new Date('2023-01-01').toISOString(),
    content: JSON.stringify([
      {
        "id": "1",
        "type": "heading",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left",
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "Welcome to our Machuca Wiki",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "2",
        "type": "paragraph",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "This is a collaborative space for our community to share and maintain relevant local information. Feel free to browse existing pages or contribute by editing them.",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "3",
        "type": "bulletListItem",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "Browse existing pages using the sidebar",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "4",
        "type": "bulletListItem",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "Create new pages with the + button",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "5",
        "type": "bulletListItem",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "Edit any page to add your knowledge",
            "styles": {}
          }
        ],
        "children": []
      }
    ]),
    lastEdited: 'March 10, 2025'
  },
  'community-guidelines': {
    id: 'community-guidelines',
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    created_at: new Date('2023-01-15').toISOString(),
    updated_at: new Date('2023-01-15').toISOString(),
    content: JSON.stringify([
      {
        "id": "1",
        "type": "heading",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left",
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "Community Guidelines",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "2",
        "type": "paragraph",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "To maintain a healthy and productive community environment, please follow these guidelines when interacting with others and contributing to our wiki.",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "3",
        "type": "heading",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left",
          "level": 2
        },
        "content": [
          {
            "type": "text",
            "text": "Respect Everyone",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "4",
        "type": "paragraph",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "Treat all community members with respect and kindness. Disagreements are normal, but always discuss ideas rather than attacking people.",
            "styles": {}
          }
        ],
        "children": []
      }
    ]),
    lastEdited: 'March 15, 2025'
  },
  'local-resources': {
    id: 'local-resources',
    slug: 'local-resources',
    title: 'Local Resources',
    created_at: new Date('2023-01-18').toISOString(),
    updated_at: new Date('2023-01-18').toISOString(),
    content: JSON.stringify([
      {
        "id": "1",
        "type": "heading",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left",
          "level": 1
        },
        "content": [
          {
            "type": "text",
            "text": "Local Resources",
            "styles": {}
          }
        ],
        "children": []
      },
      {
        "id": "2",
        "type": "paragraph",
        "props": {
          "textColor": "default",
          "backgroundColor": "default",
          "textAlignment": "left"
        },
        "content": [
          {
            "type": "text",
            "text": "This page contains a list of useful local resources and services available in our community.",
            "styles": {}
          }
        ],
        "children": []
      }
    ]),
    lastEdited: 'March 18, 2025'
  }
};
