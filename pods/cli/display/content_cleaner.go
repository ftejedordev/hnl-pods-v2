package display

import (
	"regexp"
	"strings"
)

// ContentCleaner handles cleaning of LLM output content
type ContentCleaner struct {
	tagPatterns []*regexp.Regexp
}

// NewContentCleaner creates a new content cleaner with predefined patterns
func NewContentCleaner() *ContentCleaner {
	// Define tag patterns to remove (similar to FlowBuilder.tsx:61-67)
	patterns := []string{
		`<answer[^>]*>(.*?)</answer>`,
		`<think[^>]*>(.*?)</think>`,
		`<reasoning[^>]*>(.*?)</reasoning>`,
		`<thought[^>]*>(.*?)</thought>`,
		`<internal[^>]*>(.*?)</internal>`,
		`<planning[^>]*>(.*?)</planning>`,
		`<analysis[^>]*>(.*?)</analysis>`,
	}

	var compiledPatterns []*regexp.Regexp
	for _, pattern := range patterns {
		if regex, err := regexp.Compile("(?s)" + pattern); err == nil {
			compiledPatterns = append(compiledPatterns, regex)
		}
	}

	return &ContentCleaner{
		tagPatterns: compiledPatterns,
	}
}

// CleanContent removes unwanted LLM wrapper tags from text content
func (cc *ContentCleaner) CleanContent(text string) string {
	if text == "" {
		return text
	}

	cleanedText := text

	// Remove LLM wrapper tags and extract their content
	for _, pattern := range cc.tagPatterns {
		cleanedText = pattern.ReplaceAllString(cleanedText, "$1")
	}

	// Remove reserved token artifacts (e.g., <|reserved_token_163839|>)
	reservedTokenPattern := regexp.MustCompile(`<\|reserved_token_\d+\|>`)
	cleanedText = reservedTokenPattern.ReplaceAllString(cleanedText, "")

	// Clean up any remaining empty lines or excessive whitespace
	cleanedText = strings.TrimSpace(cleanedText)

	// Replace multiple consecutive newlines with at most 2
	multiNewlinePattern := regexp.MustCompile(`\n{3,}`)
	cleanedText = multiNewlinePattern.ReplaceAllString(cleanedText, "\n\n")

	return cleanedText
}

// CleanAgentOutput specifically cleans agent output messages
func (cc *ContentCleaner) CleanAgentOutput(output string) string {
	if output == "" {
		return output
	}

	cleaned := cc.CleanContent(output)

	// Remove reserved token artifacts (e.g., <|reserved_token_163839|>)
	reservedTokenPattern := regexp.MustCompile(`<\|reserved_token_\d+\|>`)
	cleaned = reservedTokenPattern.ReplaceAllString(cleaned, "")

	// Additional cleaning for agent outputs
	// Remove any remaining XML-like tags that might have been missed
	xmlTagPattern := regexp.MustCompile(`<[^>]+>`)
	cleaned = xmlTagPattern.ReplaceAllString(cleaned, "")

	// Clean up excessive whitespace and multiple consecutive spaces
	cleaned = strings.TrimSpace(cleaned)

	// Replace multiple spaces with single space
	multiSpacePattern := regexp.MustCompile(`\s+`)
	cleaned = multiSpacePattern.ReplaceAllString(cleaned, " ")

	return cleaned
}

// CleanEventMessage cleans SSE event messages
func (cc *ContentCleaner) CleanEventMessage(message string) string {
	if message == "" {
		return message
	}

	// For event messages, we want to be more conservative
	// Only remove the most common wrapper tags
	cleaned := message

	// Remove answer tags but preserve content
	answerPattern := regexp.MustCompile(`(?s)<answer[^>]*>(.*?)</answer>`)
	cleaned = answerPattern.ReplaceAllString(cleaned, "$1")

	// Remove think tags completely (these are usually internal thoughts)
	thinkPattern := regexp.MustCompile(`(?s)<think[^>]*>.*?</think>`)
	cleaned = thinkPattern.ReplaceAllString(cleaned, "")

	return strings.TrimSpace(cleaned)
}

// IsLLMWrapperTag checks if the text is entirely wrapped in LLM tags
func (cc *ContentCleaner) IsLLMWrapperTag(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}

	// Check if the entire text is wrapped in one of the LLM tags
	for _, pattern := range cc.tagPatterns {
		if pattern.MatchString(text) {
			// Check if the match covers the entire string
			matches := pattern.FindStringSubmatch(text)
			if len(matches) > 0 && strings.TrimSpace(matches[0]) == text {
				return true
			}
		}
	}

	return false
}
