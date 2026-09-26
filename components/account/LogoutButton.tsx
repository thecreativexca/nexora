import { logoutAction } from "@/app/(storefront)/account/actions";
import { Button } from "@/components/ui/Button";

/** Submits the logout Server Action, which revokes the session row and cookie. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary" size="sm">
        Sign out
      </Button>
    </form>
  );
}
