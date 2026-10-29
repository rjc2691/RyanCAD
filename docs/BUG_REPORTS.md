# Shared bug reports and feature requests

The **Bug reports** toolbar button follows Experimental features. It opens a dropdown shared by every browser using this RyanCAD server. Reports are independent of browser workspaces, designs, parameters and feature history. Everyone with access to the app can read, edit or delete them under the current access model.

Use **New report**, choose Bug or Feature request, and enter a title. Separate fields hold the date, reproduction steps, error message and additional information. New reports automatically fill an editable Browser / device information field with the user agent, browser-reported platform, language, viewport/screen sizes, device pixel ratio, touch-point count and time zone. Browser privacy restrictions may obscure exact OS versions. No external detection service, device permissions or automatic screenshot capture is used.

Add screenshots through **choose files**, drag-and-drop into the report form, or paste an image while the report editor is focused. Text paste remains normal in text fields. PNG, JPEG and WebP are supported, up to 8 screenshots and 5 MB total per report, with 4 MB maximum per image. These limits fit the existing server request-size limit. Thumbnails appear before submitting; remove individual images with ×. Existing screenshots are only removed from disk after saving the edit. Click saved thumbnails to view full images in a new tab.

**Save report** writes the report and screenshots. Expand a saved row to read it, use **Edit** to change it, or **Delete** followed by the inline confirmation to remove it. Search filters report text. The refresh button and a 15-second refresh while open pick up other users' changes. Conflicting edits/deletes are rejected using per-report versions; a failed save leaves the draft visible. Closing the dropdown retains its draft in memory; refreshing the page discards unsaved drafts. Saved reports survive browser refreshes and server restarts.

## Storage and backups

Reports live beneath the initial server project directory, not a workspace's current design:

```text
<server --project directory>/feedback/
  reports.yaml
  screenshots/
    <report ID>/
      <image ID>
```

For the default local launch this is `runtime/projects/default.rycad/feedback/reports.yaml`. Screenshot filenames on disk are generated IDs; original filenames and MIME types are recorded in YAML. Multiline report text uses readable YAML block scalars. Files are not embedded as base64 in YAML. Back up the entire `feedback` folder together. Native CAD downloads do not include this shared feedback collection. Independently launched servers using different initial project directories have separate report collections.

YAML replacements are atomic and synchronized within the server. New image files are rolled back if saving the manifest fails; obsolete images are cleaned up after a successful manifest change. Malformed YAML is reported without overwriting it. Report writes never invoke CAD commands or change a document revision. Avoid manually editing the file while the server is running.

## API

All routes use existing app authentication/host rules and deliberately bypass workspace/design routing:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/reports` | Shared list, newest updates first |
| POST | `/api/reports` | Create report and optional screenshots |
| GET | `/api/reports/{id}` | Read one report |
| PUT | `/api/reports/{id}` | Update with current `version` |
| DELETE | `/api/reports/{id}?version=N` | Delete with conflict protection |
| GET | `/api/reports/{id}/images/{imageId}` | Read a screenshot with its image MIME type |

Create/update fields are `kind` (`bug` or `feature`), `title`, `date` (`YYYY-MM-DD`), `steps`, `error`, `notes`, `environment`, `keep_images` (IDs retained during an update) and `images` (new `{filename, data}` objects containing base64 image bytes). Updates also require the last read `version`. Response records include generated IDs, creation/update timestamps and screenshot metadata. Server-generated paths do not use uploaded filenames.

Implementation: `src/ryancad/reports.py`, routes in `api.py`, and `frontend/src/BugReports.tsx`. Verification: `tests/test_reports.py` and `scripts/ui_bug_reports_check.mjs`.
