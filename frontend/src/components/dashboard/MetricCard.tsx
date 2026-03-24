import { Card, CardContent, Typography } from '@mui/material';

interface Props {
  label: string;
  value: number;
  color?: 'default' | 'warning' | 'error' | 'success' | 'info';
  onClick?: () => void;
}

export default function MetricCard({ label, value, color = 'default', onClick }: Props) {
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: '0.2s',
        '&:hover': onClick
          ? {
              transform: 'translateY(-2px)',
              boxShadow: 3,
            }
          : {},
        borderLeft: `4px solid`,
        borderColor:
          color === 'error'
            ? 'error.main'
            : color === 'warning'
            ? 'warning.main'
            : color === 'success'
            ? 'success.main'
            : color === 'info'
            ? 'info.main'
            : 'grey.300',
      }}
    >
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>

        <Typography variant="h5" fontWeight={600}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
