export function corsOptions(clientUrl) {
  return {
    origin: clientUrl,
    credentials: true,
  };
}
