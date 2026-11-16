export class ApiError extends Error {
  status: number;
  code: string;
  field?: string;
  extra?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    field?: string,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.extra = extra;
  }
}

export const badRequest = (message: string, field?: string) =>
  new ApiError(400, 'INVALID_INPUT', message, field);
export const unauthorized = (message = 'Vui lòng đăng nhập.') =>
  new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này.') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Không tìm thấy dữ liệu.') =>
  new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code = 'CONFLICT') =>
  new ApiError(409, code, message);
export const invalid = (message: string, field?: string) =>
  new ApiError(422, 'UNPROCESSABLE', message, field);
