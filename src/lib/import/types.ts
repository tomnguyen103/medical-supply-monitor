/** A validation error tied to a specific source row (1-based spreadsheet line). */
export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: T[];
  errors: RowError[];
}
