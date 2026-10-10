export function apiResponse(success, message, extra = {}) {
  return { success, message, ...extra };
}
