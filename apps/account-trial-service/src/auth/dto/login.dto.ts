import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(254, { message: 'Email quá dài' })
  email!: string;

  // Login không áp policy mạnh như register: chỉ cần khớp mật khẩu đã lưu.
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(1, { message: 'Mật khẩu không được để trống' })
  @MaxLength(72, { message: 'Mật khẩu không được quá 72 ký tự' })
  password!: string;
}
