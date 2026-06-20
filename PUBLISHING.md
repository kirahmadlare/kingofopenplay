# Publishing King of Open Play

King of Open Play is a static Progressive Web App. It can be stored in a public Git
repository and hosted without a database or application server.

## Before publishing

1. Review the public Developer King credit and add contact information if desired.
2. Add a software license. Choose the license intentionally; do not publish
   without one if you want other people to know what reuse is permitted.
3. Review the repository for exported sessions, player names, credentials, or
   other private data.
4. Add screenshots and your public contact or issue-reporting method if desired.
5. Test the website over HTTPS because installation and offline service workers
   require a secure production origin.

## Create and push the repository

```powershell
git add .
git commit -m "Initial King of Open Play release"
git branch -M main
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

## Static hosting

Publish the repository root. There is no build command and no output folder.
Compatible services include GitHub Pages, Cloudflare Pages, Netlify, and similar
static-site hosts.

## Important privacy note

Do not commit exported event JSON files containing real player names. Browser
sessions remain local unless someone explicitly exports and shares them.
