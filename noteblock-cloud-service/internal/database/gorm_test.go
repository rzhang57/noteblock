package database

import (
	"net/url"
	"strings"
	"testing"
)

// pgx reads query parameters after the authority and lets them override it, so a value carrying
// "&host=" would redirect the whole connection if the DSN were built by concatenation.
func TestConnStringCannotBeRewrittenByAValue(t *testing.T) {
	t.Setenv("BLUEPRINT_DB_SQLITE_PATH", "")
	t.Setenv("BLUEPRINT_DB_HOST", "real.example.com")
	t.Setenv("BLUEPRINT_DB_PORT", "5432")
	t.Setenv("BLUEPRINT_DB_DATABASE", "postgres")
	t.Setenv("BLUEPRINT_DB_USERNAME", "noteblock_sync")
	t.Setenv("BLUEPRINT_DB_PASSWORD", "p@ss&word")
	t.Setenv("BLUEPRINT_DB_SCHEMA", "public&host=attacker.example.com&user=mallory&password=zzz")

	parsed, err := url.Parse(ConnString())
	if err != nil {
		t.Fatalf("connection string does not parse: %v", err)
	}

	if parsed.Hostname() != "real.example.com" {
		t.Errorf("host = %q, want real.example.com; a value rewrote the authority", parsed.Hostname())
	}
	if parsed.User.Username() != "noteblock_sync" {
		t.Errorf("user = %q, want noteblock_sync", parsed.User.Username())
	}
	if pw, _ := parsed.User.Password(); pw != "p@ss&word" {
		t.Errorf("password = %q, want it carried verbatim", pw)
	}
	if got := parsed.Query().Get("search_path"); got != "public&host=attacker.example.com&user=mallory&password=zzz" {
		t.Errorf("search_path = %q, want the whole value as one parameter", got)
	}
	if strings.Count(parsed.RawQuery, "host=") != 0 {
		t.Errorf("query %q contains a host parameter", parsed.RawQuery)
	}
}

// This feature exists to reach a database that is not on localhost, so the password must not
// cross the network in the clear unless someone asks for that explicitly.
func TestTLSIsTheDefault(t *testing.T) {
	t.Setenv("BLUEPRINT_DB_SQLITE_PATH", "")
	t.Setenv("BLUEPRINT_DB_SSLMODE", "")
	t.Setenv("BLUEPRINT_DB_HOST", "db.example.com")
	t.Setenv("BLUEPRINT_DB_PORT", "5432")

	parsed, err := url.Parse(ConnString())
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if mode := parsed.Query().Get("sslmode"); mode != "require" {
		t.Errorf("sslmode = %q, want require", mode)
	}
}
