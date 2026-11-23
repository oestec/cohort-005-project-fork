import { Link } from "react-router";

const LINK_CLASS = "transition-colors hover:text-foreground";

export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/" className="text-lg font-bold tracking-tight">
            Cadence
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Learn to code, at your own pace.
          </p>
        </div>
        <nav className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Link to="/courses" className={LINK_CLASS}>
            Courses
          </Link>
          {signedIn ? (
            <Link to="/dashboard" className={LINK_CLASS}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={LINK_CLASS}>
                Log In
              </Link>
              <Link to="/signup" className={LINK_CLASS}>
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
