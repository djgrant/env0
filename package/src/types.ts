export type ReadOptions = {
  source: string;
  files?: string[];
  entries?: string[];
};

export type OnePasswordItem = {
  id: string;
  title: string;
  version: number;
  vault: {
    id: string;
    name: string;
  };
  category: string;
  last_edited_by: string;
  created_at: string;
  updated_at: string;
  sections: { id: string }[];
  fields: {
    id: string;
    type: string;
    purpose: string;
    label: string;
    reference: string;
    section: { id: string };
    value: string;
  }[];
};
