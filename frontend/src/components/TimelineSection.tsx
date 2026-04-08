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

export default function TimelineSection({ entityType, entityId }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const data = await getTimeline(entityType, entityId);
      setEvents(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [entityType, entityId]);

  const handleCreate = async () => {
    if (!comment.trim()) return;
    try {
      await createComment({ entityType, entityId, message: comment });
      setComment('');
      fetchTimeline();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      await editComment(id, editingText);
      setEditingId(null);
      fetchTimeline();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await deleteComment(id);
      fetchTimeline();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const formatTime = (date: string) => new Date(date).toLocaleString();

  const getSystemText = (event: any) => {
    const username = event.user?.username || 'System';
    switch (event.action) {
      case 'SUBMIT':
        return `${username} submitted the request`;
      case 'APPROVE':
        return `${username} approved the request`;
      case 'REJECT':
        return `${username} rejected the request`;
      case 'CANCEL':
        return `${username} cancelled the request`;
      default:
        return event.action;
    }
  };

  const isOwner = (event: any) =>
    currentUser && event.user?.id === currentUser.id;

  return (
    <Box mt={4}>
      <Typography variant="h6" gutterBottom>
        Activity Timeline
      </Typography>

      {/* Comment input always visible */}
      <Box display="flex" gap={2} mb={3}>
        <TextField
          fullWidth
          placeholder="Write a comment..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <Button variant="contained" onClick={handleCreate}>
          Send
        </Button>
      </Box>

      {events.length === 0 ? (
        <Box mt={2}>
          <Typography color="textSecondary">No activities yet.</Typography>
          <Typography variant="body2" color="textSecondary">
            Start by adding a comment or performing an action.
          </Typography>
        </Box>
      ) : (
        events.map((event) => (
          <Box key={event.id} mb={2} p={2} border="1px solid #eee" borderRadius={2}>
            <Typography variant="subtitle2">
              {event.user?.username || '-'}
            </Typography>

            {/* COMMENT */}
            {event.type === 'COMMENT' && (
              <>
                {editingId === event.metadata.commentId ? (
                  <Box display="flex" gap={1}>
                    <TextField
                      fullWidth
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                    <Button onClick={() => handleEdit(event.metadata.commentId)}>
                      Save
                    </Button>
                    <Button onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Typography>
                    💬 {event.metadata.message}{' '}
                    {event.metadata.isEdited && '(edited)'}
                  </Typography>
                )}

                {!event.metadata.isDeleted && isOwner(event) && (
                  <Box>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditingId(event.metadata.commentId);
                        setEditingText(event.metadata.message);
                      }}
                    >
                      Edit
                    </Button>

                    <Button
                      size="small"
                      color="error"
                      onClick={() => setDeleteId(event.metadata.commentId)}
                    >
                      Delete
                    </Button>
                  </Box>
                )}
              </>
            )}

            {/* ATTACHMENT */}
            {event.type === 'ATTACHMENT' && (
              <Typography>
                📎 {event.action === 'UPLOADED' ? 'Uploaded' : 'Deleted'}{' '}
                {event.metadata?.fileName}
                {event.metadata?.description && (
                  <> — "{event.metadata.description}"</>
                )}
              </Typography>
            )}

            {/* SYSTEM */}
            {event.type === 'SYSTEM' && (
              <Typography
                color={
                  event.action === 'APPROVE'
                    ? 'success.main'
                    : event.action === 'REJECT'
                    ? 'error.main'
                    : 'text.primary'
                }
              >
                {getSystemText(event)}
              </Typography>
            )}

            <Typography variant="caption" color="textSecondary">
              {formatTime(event.timestamp)}
            </Typography>
          </Box>
        ))
      )}

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
