# Prayer Circle

A React + Firebase web app where users can submit prayer requests, pray for
others, add friends, and join prayer circles. Each prayer can be shared:

- **Publicly** — visible to every signed-in user
- **With one or more prayer circles** you've joined
- **With one specific friend** — a private prayer between two people

## Stack

- React 18 + Vite
- React Router 6
- Firebase Auth (email/password)
- Cloud Firestore (data + security rules)
- Firebase Hosting (for deployment)

## Project layout

```
src/
  main.jsx            # React entry point
  App.jsx             # Router + route guards
  firebase.js         # Firebase SDK initialization
  styles.css          # App styles
  context/
    AuthContext.jsx   # Auth provider + user profile loading
  components/
    Layout.jsx        # Top bar + nav
  pages/
    Login.jsx
    Signup.jsx
    Feed.jsx          # Prayer feed with tabs (All / Public / Circles / For me / Mine)
    NewPrayer.jsx     # Submit a prayer with visibility options
    Friends.jsx       # Search users, send/accept friend requests, list friends
    Circles.jsx       # Create, discover, and join prayer circles
    CircleDetail.jsx  # Circle members + circle-specific prayers
firestore.rules       # Security rules enforcing visibility
firestore.indexes.json
firebase.json         # Hosting + Firestore config
```

## Firestore data model

- `users/{uid}` — `displayName`, `displayNameLower`, `email`, `friendIds[]`,
  `circleIds[]`, `createdAt`
- `friendships/{sortedUidPair}` — `users[2]`, `requestedBy`, `status` (`pending`
  or `accepted`), timestamps
- `circles/{circleId}` — `name`, `description`, `createdBy`, `members[]`,
  `createdAt`
- `prayers/{prayerId}` — `text`, `authorId`, `authorName`, `visibility`
  (`public` | `friend` | `circles`), `targetUserId`, `circleIds[]`,
  `prayedBy[]`, `prayedCount`, `createdAt`

Visibility is enforced at the rules level by reading the prayer doc's
`visibility`, `authorId`, `targetUserId`, and `circleIds` fields (compared
against the requesting user's `users/{uid}.circleIds`).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Firebase project at <https://console.firebase.google.com>, then:

   - Enable **Authentication → Email/Password**
   - Create a **Cloud Firestore** database (production mode)
   - Register a **Web app** and copy the config values

3. Create `.env` from the template and fill in your Firebase config:

   ```bash
   cp .env.example .env
   ```

4. Update `.firebaserc` with your Firebase project id.

## Run locally

```bash
npm run dev
```

Visit <http://localhost:5173>.

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
npm run deploy   # builds + deploys Hosting
```

## Notes & next steps

- Friend search uses a prefix query on `displayNameLower`. For fuzzy
  search, plug in Algolia or a Cloud Function.
- The "For me" feed tab shows prayers where you are the targeted friend.
- Deleting a user from a circle or friendship removes them from both sides.
- Consider adding: password reset, notifications, comments on prayers,
  prayer answered/archived state, and moderation tools.
