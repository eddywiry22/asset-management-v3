import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material';

import { getTimeline } from '../services/timeline.service';
import {
  createComment,
  editComment,
  deleteComment,
} from '../services/comments.service';

type Props = {
  entityType: string;
  entityId: string;
};

const SPAM_DELAY_MS = 10_000;

export default function TimelineSection({ entityType, entityId }: Props) {
  const [events, setEvents]               = useState<any[]>([]);
  const [comment, setComment]             = useState('');
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editingText, setEditingText]     = useState('');
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [lastCommentTime, setLastCommentTime] = useState<number | null>(null);
  const [spamWarning, setSpamWarning]     = useState(false);
  const [refreshing, setRefreshing]       = useState(false);

  const currentUser = (() => {
    try {
      const raw = localStorage.getItem('auth_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const fetchTimeline = async () => {
    try {
      setError(null);
      const data = await getTimeline(entityType, entityId);
      const sorted = [...data].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setEvents(sorted);
    } catch (err) {
      console.error(err);
      setError('Failed to load timeline');
    }
  };

  const refreshTimeline = async () => {
    setRefreshing(true);
    try {
      await fetchTimeline();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [entityType, entityId]);

  const handleCreate = async () => {
    if (!comment.trim()) return;

    if (lastCommentTime !== null && Date.now() - lastCommentTime < SPAM_DELAY_MS) {
      setSpamWarning(true);
      return;
    }
    setSpamWarning(false);

    try {
      await createComment({ entityType, entityId, message: comment });
      setComment('');
      setLastCommentTime(Date.now());
      await refreshTimeline();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      await editComment(id, editingText);
      setEditingId(null);
      await refreshTimeline();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await deleteComment(id);
      await refreshTimeline();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleString();

  const formatHHMM = (ts: string) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getSystemText = (event: any) => {
    const meta = event.metadata || {};
    const transition = meta.from && meta.to ? ` (from ${meta.from} → ${meta.to})` : '';
    switch (event.action) {
      case 'SUBMIT':   return `Submitted${transition}`;
      case 'APPROVE':  return `Approved${transition}`;
      case 'REJECT':   return `Rejected${transition}`;
      case 'CANCEL':   return `Cancelled${transition}`;
      case 'FINALIZE': return `Finalized${transition}`;
      case 'UPDATE':   return `Updated${transition}`;
      default:         return `${event.action}${transition}`;
    }
  };

  const eventStyle = (type: string) => {
    switch (type) {
      case 'SYSTEM':     return { background: '#f5f5f5', borderColor: '#e0e0e0' };
      case 'ATTACHMENT': return { background: '#f0f7ff', borderColor: '#bbdefb' };
      default:           return { background: '#ffffff', borderColor: '#eeeeee' };
    }
  };

  const isOwner = (event: any) =>
    event.type === 'COMMENT' && currentUser && event.user?.id === currentUser.id;

  return (
    <Box mt={4}>
      <Typography variant="h6" gutterBottom>
        Activity Timeline
      </Typography>

      {/* Comment input — always visible */}
      <Box display="flex" gap={2} mb={1}>
        <TextField
          fullWidth
          placeholder="Write a comment..."
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSpamWarning(false);
          }}
        />
        <Button variant="contained" onClick={handleCreate}>
          Send
        </Button>
      </Box>
      {spamWarning && (
        <Typography variant="body2" color="warning.main" mb={2}>
          Please wait before posting another comment.
        </Typography>
      )}

      <Box mb={3} />

      {/* Error */}
      {error && (
        <Typography color="error.main" mb={2}>
          {error}
        </Typography>
      )}

      {refreshing && (
        <Typography variant="caption" color="text.secondary" mb={1} display="block">
          Updating...
        </Typography>
      )}

      {/* Empty state */}
      {!error && events.length === 0 && (
        <Typography color="text.secondary" mb={2}>
          No activities yet
        </Typography>
      )}

      {/* Events */}
      {events.map((event, index) => {
        const style       = eventStyle(event.type);
        const commentId   = event.type === 'COMMENT'    ? event.id.replace(/^comment-/, '')    : null;
        const attachmentId = event.type === 'ATTACHMENT' ? event.id.replace(/^attachment-/, '') : null;

        return (
          <Box key={event.id}>
            <Box
              p={2}
              mb={1}
              sx={{
                border: `1px solid ${style.borderColor}`,
                borderRadius: 2,
                background: style.background,
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                {event.user?.username || 'System'}
              </Typography>

              {/* SYSTEM */}
              {event.type === 'SYSTEM' && (
                <Typography color="text.secondary" mt={0.5}>
                  ⚙️ {getSystemText(event)}
                </Typography>
              )}

              {/* COMMENT */}
              {event.type === 'COMMENT' && (
                <>
                  {editingId === commentId ? (
                    <Box display="flex" gap={1} mt={1}>
                      <TextField
                        fullWidth
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                      />
                      <Button variant="contained" onClick={() => handleEdit(commentId!)}>
                        Save
                      </Button>
                      <Button onClick={() => { setEditingId(null); setEditingText(''); }}>
                        Cancel
                      </Button>
                    </Box>
                  ) : (
                    <Typography mt={0.5}>
                      💬 {event.metadata?.content || ''}
                      {event.metadata?.editedAt && (
                        <Typography component="span" variant="caption" color="text.secondary" ml={1}>
                          (edited at {formatHHMM(event.metadata.editedAt)})
                        </Typography>
                      )}
                    </Typography>
                  )}

                  {editingId !== commentId && isOwner(event) && (
                    <Box mt={1}>
                      <Button
                        size="small"
                        onClick={() => {
                          setEditingId(commentId!);
                          setEditingText(event.metadata?.content || '');
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setDeleteId(commentId!)}
                      >
                        Delete
                      </Button>
                    </Box>
                  )}
                </>
              )}

              {/* ATTACHMENT */}
              {event.type === 'ATTACHMENT' && (
                <Typography mt={0.5}>
                  📎 Uploaded file:{' '}
                  <a
                    href={`/api/v1/attachments/${attachmentId}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {(event.metadata?.filePath || '').split('/').pop() || event.metadata?.fileName || ''}
                  </a>
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                {formatTime(event.timestamp)}
              </Typography>
            </Box>

            {index < events.length - 1 && <Divider sx={{ mb: 1 }} />}
          </Box>
        );
      })}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete Comment</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this comment?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            disabled={deleting}
            onClick={async () => {
              if (deleteId) {
                await handleDelete(deleteId);
                setDeleteId(null);
              }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
