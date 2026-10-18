export function indexLookupRequest(message) {
  if (typeof message !== "object" || message === null) return null;
  if (message.origin !== "content") return null;
  if (message.operation !== "index-lookup") return null;
  if (typeof message.companyName !== "string") return null;
  return message.companyName;
}
