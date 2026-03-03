package ipc

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"
)

type Request struct {
	ID     string          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

type RPCError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Response struct {
	ID     string    `json:"id"`
	Result any       `json:"result,omitempty"`
	Error  *RPCError `json:"error,omitempty"`
}

func parseParams(raw json.RawMessage, out any) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, out)
}

func rpcErr(reqID, code, message string) Response {
	return Response{
		ID: reqID,
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
	}
}

func dbErrToRPC(reqID string, err error, fallback string) Response {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return rpcErr(reqID, "NOT_FOUND", "Record not found")
	}
	return rpcErr(reqID, "INTERNAL", fallback)
}
