# Name the signed-in user's id `currentUserId`

Loaders and actions were split between `userId`, `sessionUserId` and
`meId` for the person making the request, which made it hard to see at a glance
whether a query was scoped to the caller or to somebody else. The signed-in
user's id is called `currentUserId`; any other user's id is `userId`.
