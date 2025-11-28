package logging

import (
	"encoding/json"
	"fmt"
	"log"
)

// Entry defines a log entry for Cloud Logging.
type Entry struct {
	Message  string `json:"message"`
	Severity string `json:"severity,omitempty"`
	Trace    string `json:"logging.googleapis.com/trace,omitempty"`

	// Logs Explorer allows filtering and display of this as `jsonPayload.component`.
	Component string `json:"component,omitempty"`
}

// String renders an entry structure to the JSON format expected by Cloud Logging.
func (e Entry) String() string {
	if e.Severity == "" {
		e.Severity = "INFO"
	}
	out, err := json.Marshal(e)
	if err != nil {
		log.Printf("json.Marshal: %v", err)
	}
	return string(out)
}

// Info logs an informational message with the specified component.
func Info(component, message string) {
	log.Println(Entry{
		Component: component,
		Severity:  "INFO",
		Message:   message,
	})
}

// Error logs an error message with the specified component and optional error.
func Error(component, message string, err error) {
	msg := message
	if err != nil {
		msg = fmt.Sprintf("%s: %v", message, err)
	}
	log.Println(Entry{
		Component: component,
		Severity:  "ERROR",
		Message:   msg,
	})
}

// Warning logs a warning message with the specified component.
func Warning(component, message string) {
	log.Println(Entry{
		Component: component,
		Severity:  "WARNING",
		Message:   message,
	})
}

// InfoF logs an informational message with formatting support.
func InfoF(component, format string, args ...interface{}) {
	Info(component, fmt.Sprintf(format, args...))
}

// ErrorF logs an error message with formatting support.
func ErrorF(component, format string, args ...interface{}) {
	Error(component, fmt.Sprintf(format, args...), nil)
}

// WarningF logs a warning message with formatting support.
func WarningF(component, format string, args ...interface{}) {
	Warning(component, fmt.Sprintf(format, args...))
}
