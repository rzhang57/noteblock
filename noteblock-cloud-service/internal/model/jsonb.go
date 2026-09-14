package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	switch v := value.(type) {
	case nil:
		*j = nil
		return nil
	case []byte:
		return json.Unmarshal(v, j)
	// Postgres hands back []byte, SQLite a string.
	case string:
		return json.Unmarshal([]byte(v), j)
	default:
		return errors.New("jsonb: unsupported scan type")
	}
}
