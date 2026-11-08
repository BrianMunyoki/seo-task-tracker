# SEO Task Tracker

A simple sprint and task tracker for SEO work (Strategy, Onsite Optimization, Link Building, AEO).

- **Frontend:** plain HTML, CSS and JavaScript (no build step)
- **Backend:** Vercel serverless functions in `/api`
- **Storage:** Vercel Blob (tasks are saved as one JSON file, attachments as files)
- **Login:** one password, set as an environment variable

## Features
- Tasks get numbers automatically (#1, #2, ...)
- Statuses: To Do (0%), Doing, Blocked, Done (100%)
- Fibonacci story points, progress %, deadline, description, status updates
- Link tasks: type `#12` in a description or update, or add task numbers to "Linked tasks"
- Attach files to tasks (max 4 MB each)
- Filter by category
- Schedule a task with "Show from" so it stays hidden until that date
- Current Backlog (1- or 2-week sprint), Full Backlog, Previous Backlog (done)
- Close a sprint: done tasks go to Previous Backlog; re-estimate unfinished tasks and move them to the next sprint or the backlog
- Export / import a JSON backup

## Project structure
```
index.html      page layout
style.css       styles
app.js          frontend logic
api/_lib.js     password check + helpers
api/data.js     GET/PUT all tasks and sprints
api/files.js    upload / download / delete files
api/_storage.js saves to Vercel Blob online, or the .data folder locally
dev-server.js   local server for `npm run dev`
package.json    backend dependency (@vercel/blob)
```

## Deploy (GitHub + Vercel)
1. Push this folder to a new GitHub repo.
2. On vercel.com: **Add New → Project** → import the repo → **Deploy**.
3. In the project: **Storage → Create → Blob** → choose **Private** access → connect it to the project.
   This adds `BLOB_READ_WRITE_TOKEN` automatically.
4. **Settings → Environment Variables** → add `APP_PASSWORD` with a password of your choice.
5. **Deployments → Redeploy** so the new variables take effect.
6. Open the site and enter your password once per browser.

If you created a **Public** Blob store instead, also add `BLOB_ACCESS=public`.

## API
All requests need the header `x-app-password`.

| Method | Route | What it does |
|---|---|---|
| GET | `/api/data` | Load all tasks and sprints |
| PUT | `/api/data` | Save all tasks and sprints (JSON body) |
| POST | `/api/files?name=file.pdf` | Upload a file (raw body) |
| GET | `/api/files?pathname=files/...` | Download a file |
| DELETE | `/api/files?pathname=files/...` | Delete a file |

## Run locally
```
npm install
npm run dev
```
Open http://localhost:3000 and use the password `dev`.
Locally, tasks and files are saved in the `.data` folder (not uploaded to GitHub).
To use a different password: `APP_PASSWORD=mypassword npm run dev`.
