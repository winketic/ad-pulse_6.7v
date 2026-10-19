/** The single verified account allowed to view platform-wide operational metadata. */
export const PLATFORM_OWNER_EMAIL = "altai.dx@gmail.com";

export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}
