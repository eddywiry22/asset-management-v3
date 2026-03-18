import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CategoryIcon from '@mui/icons-material/Category';
import BusinessIcon from '@mui/icons-material/Business';
import ScaleIcon from '@mui/icons-material/Scale';
import InventoryIcon from '@mui/icons-material/Inventory';
import LinkIcon from '@mui/icons-material/Link';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import TuneIcon from '@mui/icons-material/Tune';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const DRAWER_WIDTH = 240;

interface SidebarProps {
  open: boolean;
}

export default function Sidebar({ open }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();

  const navGroups = [
    {
      label: 'General',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
        { label: 'Stock',              path: '/stock',              icon: <WarehouseIcon /> },
        { label: 'Stock Adjustments', path: '/stock-adjustments',  icon: <TuneIcon /> },
        { label: 'Stock Transfers',   path: '/stock-transfers',    icon: <SwapHorizIcon /> },
      ],
    },
    ...(isAdmin ? [{
      label: 'Admin',
      items: [
        { label: 'Categories', path: '/admin/categories', icon: <CategoryIcon /> },
        { label: 'Vendors',    path: '/admin/vendors',    icon: <BusinessIcon /> },
        { label: 'UOM',        path: '/admin/uoms',       icon: <ScaleIcon /> },
        { label: 'Products',               path: '/admin/products',               icon: <InventoryIcon /> },
        { label: 'Product Registrations', path: '/admin/product-registrations', icon: <LinkIcon /> },
        { label: 'Locations',             path: '/admin/locations',             icon: <LocationOnIcon /> },
        { label: 'Audit Logs',           path: '/admin/audit-logs',            icon: <HistoryIcon /> },
        { label: 'Users',               path: '/admin/users',                 icon: <PeopleIcon /> },
      ],
    }] : []),
  ];

  return (
    <Drawer
      variant="persistent"
      open={open}
      sx={{
        width: open ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
        },
      }}
    >
      <Toolbar />
      {navGroups.map((group) => (
        <div key={group.label}>
          <Typography variant="caption" sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {group.label}
          </Typography>
          <List dense>
            {group.items.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
        </div>
      ))}
    </Drawer>
  );
}
