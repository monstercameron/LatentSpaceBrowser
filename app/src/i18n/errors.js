// An error as the reader should read it: in their language when the engine named what went wrong
// (error.code, see ApiError), and otherwise as the engine wrote it. The API's own detail follows as it came.
export function errorText(error, t) {
  if (!error) return '';
  const base = error.code ? t(`error.${error.code}`, { status: error.status }) : error.message;
  return error.detail ? `${base} ${error.detail}` : base;
}
