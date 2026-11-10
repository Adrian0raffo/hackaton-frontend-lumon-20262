export type Department = { id: number; code: string; name: string };
export type Refiner = {
  id: number;
  fullName: string;
  department: Department;
  title: string;
  extension: string;
  bio: string;
  profileUrl: string | null;
  badge: { url: string; width: number; height: number } | null;
  version: number;
  updatedAt: string;
};

export type RefinerPage = {
  content: Refiner[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
};
