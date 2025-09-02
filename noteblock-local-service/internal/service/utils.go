package service

import (
	"encoding/json"
	"errors"
)

func EncodeJsonToString(rawMessage *json.RawMessage) (string, error) {
	if rawMessage == nil {
		return "", errors.New("rawMessage cannot be nil")
	}
	return string(*rawMessage), nil
}

func DecodeStringToJsonObject(data string) (*json.RawMessage, error) {
	var rawMessage json.RawMessage
	if err := json.Unmarshal([]byte(data), &rawMessage); err != nil {
		return nil, err
	}
	return &rawMessage, nil
}
