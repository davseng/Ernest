export function ErrorNotice({ message }: { message?: string }) {
  return message ? <p className="error-notice" role="alert">{message}</p> : null;
}
