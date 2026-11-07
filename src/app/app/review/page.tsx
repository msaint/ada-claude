import { requirePageUser } from "@/lib/auth/server";
import { dueReviews } from "@/lib/services/account";
import { ReviewQueue } from "@/components/course/review-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review" };

export default async function ReviewPage() {
  const user = await requirePageUser();
  const reviews = await dueReviews(user.id, user.timezone, true);
  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pt-6 pb-16 md:px-8 md:pt-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Review</h1>
      <p className="mb-8 text-sm text-muted">Short retrieval practice, spaced out over time. Each review belongs to its course.</p>
      <ReviewQueue due={reviews.due} upcoming={reviews.upcoming} />
    </div>
  );
}
