import { createClient } from '@sanity/client';
import {createImageUrlBuilder} from "@sanity/image-url";

export const client = createClient({
  projectId: "zo1houh0", // Find this in studio/sanity.config.ts
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-03-15",
});

const builder = createImageUrlBuilder(client);

export function urlFor(source) {
  return builder.image(source);
}