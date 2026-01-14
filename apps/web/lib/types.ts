// Types for X post extraction

export interface ExtractedXPost {
  text: string;
  timestamp?: string;
  author: {
    username: string;      // @handle without @
    displayName: string;   // Display name
  };
  media: {
    images: string[];      // Array of image URLs
  };
  quotedPost?: {
    text: string;
    author: {
      username: string;
      displayName: string;
    };
    url?: string;
  };
}
