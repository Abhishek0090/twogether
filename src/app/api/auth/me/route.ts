import { handler, requireUser } from "@/server/api";
import { getCouple, getPartner, toMe, toPublicUser } from "@/server/users";

export const GET = handler(async () => {
  const user = await requireUser();
  const couple = user.couple_id ? getCouple(user.couple_id) : undefined;
  const partner = getPartner(user);
  return Response.json({
    me: toMe(user),
    paired: !!partner,
    partner: partner ? toPublicUser(partner) : null,
    inviteCode: !partner ? (couple?.invite_code ?? null) : null,
  });
});
