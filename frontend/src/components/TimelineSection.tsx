import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
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

  const fetchTimeline = async () => {
    const data = await getTimeline(entityType, entityId);
    setEvents(data);
  };

  useEffect(() => {
    fetchTimeline();
  }, [entityType, entityId]);

  const handleCreate = async () => {
    if (!comment.trim()) return;
    await createComment({ entityType, entityId, message: comment });
    setComment('');
    fetchTimeline();
  };

  const handleEdit = async (id: string) => {
    await editComment(id, editingText);
    setEditingId(null);
    fetchTimeline();
  };

  const handleDelete = async (id: string) => {
    await deleteComment(id);
    fetchTimeline();
  };

  const formatTime = (date: string) => new Date(date).toLocaleString();

  return (
    <Box mt={4}>
      <Typography variant="h6" gutterBottom>
        Activity Timeline
      </Typography>

      {/* Comment input */}
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

      {/* Timeline list */}
      {events.map((event) => (
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
                </Box>
              ) : (
                <Typography>
                  💬 {event.metadata.message}{' '}
                  {event.metadata.isEdited && '(edited)'}
                </Typography>
              )}

              {!event.metadata.isDeleted && (
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
                    onClick={() => handleDelete(event.metadata.commentId)}
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
            <Typography>{event.action}</Typography>
          )}

          <Typography variant="caption" color="textSecondary">
            {formatTime(event.timestamp)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
