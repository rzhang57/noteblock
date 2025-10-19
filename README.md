# noteblock

desktop note-taking

## stack

- **backend services**: Go, Gin, GORM, SQLite
- **frontend**: TypeScript, React, Electron
- **misc**: Ollama

## currently includes

- custom, local-first, performative, file system
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

### run backend (go)

>```bash
> cd server
> go mod tidy
> go run main.go

### run frontend (electron)

> ```bash
> cd client
> npm install
> npm run dev

## access pre-release distributions

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
