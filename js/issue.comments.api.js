// js/issue.comments.api.js

export async function loadCommentsAPI(issueId) {
  const supabase = window.supabaseClient;

  const { data, error } = await supabase
    .from("comments")
    .select(`
      id,
      content,
      hp,
      faction,
      attack_count,
      defense_count,
      support_count,
      created_at,
      is_anonymous,
      parent_id,
      user:users(username)
    `)
    .eq("issue_id", Number(issueId))
    .order("created_at", { ascending: false });

  if (error) {
    console.error("댓글 로딩 실패", error);
    return [];
  }

  return data;
}

export async function updateCommentBattle(commentId, fields) {
  const supabase = window.supabaseClient;

  const { error } = await supabase
    .from("comments")
    .update(fields)
    .eq("id", commentId);

  if (error) console.error("전투 저장 실패", error);
}