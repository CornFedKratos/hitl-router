// GET /api/launcher?session=sess_xxx
// Returns a downloadable .command file that double-clicks to open Claude Code

export default async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session');

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'session parameter required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

  const script = `#!/bin/bash
# ──────────────────────────────────────────────
# HITL-AI-DLC Project Launcher
# Double-click this file to open your project
# ──────────────────────────────────────────────

echo ""
echo "  Starting your project..."
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js is required but not installed."
  echo "  Download it free at: https://nodejs.org"
  echo ""
  read -p "  Press Enter to close..."
  exit 1
fi

# Create project directory
PROJECT_DIR="$HOME/hitl-projects/${sessionId}"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Load the project
export SUPABASE_PUBLISHABLE_KEY=${supabaseKey}
npx hitl-aidlc start --session ${sessionId}

# Keep terminal open if something went wrong
echo ""
read -p "  Press Enter to close..."
`;

  return new Response(script, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="start-project.command"`,
    },
  });
};

export const config = {
  path: '/api/launcher',
};
