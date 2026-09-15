package server

import (
	"path/filepath"
	"testing"
)

func TestBlobDirPrefersTheConfiguredDirectory(t *testing.T) {
	t.Setenv("BLOB_FILE_DIR", filepath.Join("C:", "data", "cloud-images"))
	t.Setenv("BLUEPRINT_DB_SQLITE_PATH", filepath.Join("C:", "elsewhere", "cloud.sqlite"))

	if got, want := blobDir(), filepath.Join("C:", "data", "cloud-images"); got != want {
		t.Fatalf("blobDir() = %q, want %q", got, want)
	}
}

func TestBlobDirSitsBesideTheSqliteFileWhenNothingIsConfigured(t *testing.T) {
	t.Setenv("BLOB_FILE_DIR", "")
	t.Setenv("BLUEPRINT_DB_SQLITE_PATH", filepath.Join("C:", "data", "cloud.sqlite"))

	if got, want := blobDir(), filepath.Join("C:", "data", "cloud-images"); got != want {
		t.Fatalf("blobDir() = %q, want %q", got, want)
	}
}

// Pinned, not endorsed: with Postgres there is no sqlite path to sit beside, so images land in
// whatever directory the process was launched from. Every caller that configures Postgres must set
// BLOB_FILE_DIR - electron/cloudConfig.js does.
func TestBlobDirFallsBackToTheWorkingDirectoryWhenPostgresIsConfigured(t *testing.T) {
	t.Setenv("BLOB_FILE_DIR", "")
	t.Setenv("BLUEPRINT_DB_SQLITE_PATH", "")

	if got, want := blobDir(), filepath.Join(".", "cloud-images"); got != want {
		t.Fatalf("blobDir() = %q, want %q", got, want)
	}
}
