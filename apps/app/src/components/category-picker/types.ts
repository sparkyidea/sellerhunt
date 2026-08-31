export interface CategoryNode {
  fullName: string;
  id: string;
  leaf: boolean;
  level: number;
  name: string;
  parentId: string | null;
}

export interface CategoryValue {
  fullName: string;
  id: string;
}
