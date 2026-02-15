package commands

import (
	"pods-cli/config"

	"github.com/spf13/cobra"
)

// NewFlowCommand creates the flow management command
func NewFlowCommand(cfg *config.Config) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "flow",
		Short: "Manage flows (create, edit, delete, export, import)",
		Long: `Manage flows from the command line.

Commands:
  pod flow export <name>           Export flow to YAML/JSON
  pod flow import <file>           Import flow from file
  pod flow create <name>           Create new flow
  pod flow clone <source> <dest>   Clone existing flow
  pod flow edit <name>             Edit flow
  pod flow delete <name>           Delete flow

Examples:
  pod flow export dev01 --output dev01.yaml
  pod flow import flow.yaml
  pod flow create myflow --file flow.yaml
  pod flow clone dev01 dev02
  pod flow edit dev01 --description "Updated"
  pod flow delete dev02 --force`,
	}

	// Add subcommands
	cmd.AddCommand(NewFlowExportCommand(cfg))
	cmd.AddCommand(NewFlowImportCommand(cfg))
	cmd.AddCommand(NewFlowCloneCommand(cfg))
	cmd.AddCommand(NewFlowEditCommand(cfg))
	cmd.AddCommand(NewFlowDeleteCommand(cfg))

	return cmd
}
