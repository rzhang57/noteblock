# noteblock

desktop note-taking

## stack

- **backend services**: Go, Gin, GORM, SQLite
- **frontend**: TypeScript, React, Electron
- **misc**: Ollama

## currently includes

- custom, local-first, performative, file system
  - primary actions performed flow through local go binary over ipc (json) through electron main process, retroactively synced to centralized server for storage
- modular block system - blocks currently support live markdown editing/rendering, blank canvas drawings, image annotations
- free, privacy-first AI features through local LLMs via Ollama integration
- user-based cloud sync-service for seamless access to notes across devices, on and offline

## incoming features

- new block types and 3rd party integrations
- open source plugin framework that allows users to create their own block types
- PDF ingestion pipeline for lecture slides

## getting started

try before it's released to the public:

### clone the project

> ```bash
> git clone https://github.com/rzhang57/noteblock

### run frontend (electron)

> ```bash
> npm install
> npm run dev

`npm run dev` first rebuilds the local go ipc binary, then starts vite + electron.

## environment setup

frontend cloud/auth calls use `client/.env` for pointing to correct server.

```bash
cd client
cp .env.example .env
```

set this value in `client/.env`:

```bash
VITE_CLOUD_API_BASE_URL=http://localhost:8080
```

notes:
- local note/folder/block operations use ipc and do not require this url
- this url is for cloud/auth/sync http endpoints used by `RestClient`

## access pre-release distributions
use bash build script:

> ```bash 
> bash scripts/build-prerelease.sh

or manually build:

> ```bash
> cd noteblock-local-service
>
> # build background process binary
> # Windows
> go build -o bin/noteblock-server.exe ./cmd/noteblock
> # macOS
> go build -o bin/noteblock-server ./cmd/noteblock
>
> cd ..
>
> # build frontend
> cd client
> npm run build
>
> cd..
>
> # install electron dependencies
> npm install
> 
> # Windows
> npx electron-builder --win
> # macOS (must run on a Mac)
> npx electron-builder --mac

find installer for given OS under `./dist`

recommended build command from repo root:

```bash
npm run build
```

this runs the client build from `client/` and then runs `electron-builder` from repo root.

## tests

run ipc integration tests for the local go service:

```bash
cd noteblock-local-service
go test ./internal/ipc -v
```

run frontend service/preload tests:

```bash
cd client
npm test
```
