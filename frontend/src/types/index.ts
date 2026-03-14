export interface Place {
  id: string;
  name: string;
  description: string;
  image_url: string;
  type: string;
  latitude: number;
  longitude: number;
  tags: Tag[];
  address: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  tag_type: TagType;
  tag_value: string;
}

export interface TagType {
  id: string;
  name: string;
  slug: string;
  is_global: boolean;
}

export interface TagValue {
  id: string;
  name: string;
  slug: string;
  tag_type_id: string;
}

export interface UserRegisterData {
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
}

export interface UserLoginData {
  country_code: string;
  mobile_number: string;
}

export interface OTPVerifyData {
  country_code: string;
  mobile_number: string;
  otp_code: string;
}

export interface LoginResponse {
  message: string;
}

export interface VerifyOTPResponse {
  access_token: string;
  refresh_token: string;
}

export interface UserProfileResponse {
  id: string;
  first_name: string;
  last_name: string;
  country_code: string;
  mobile_number: string;
  is_verified: boolean;
  updated_at: number | null;
}

export interface ApiError extends Error {
  detail?: string;
} 