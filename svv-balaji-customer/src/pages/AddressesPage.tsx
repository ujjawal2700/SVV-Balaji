import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Input, Radio, Typography, message, Modal, Divider } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Address {
  id: string;
  type: string; // 'Home' | 'Office' | 'Other'
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  pincode: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

const mockAddresses: Address[] = [
  {
    id: 'addr-1',
    type: 'Home',
    name: 'Rahul Sharma',
    phone: '9876543210',
    addressLine1: '123 Main St, Apartment 4B',
    addressLine2: 'Andheri West',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    isDefault: true,
  },
  {
    id: 'addr-2',
    type: 'Office',
    name: 'Rahul Sharma',
    phone: '9876543210',
    addressLine1: 'Tech Park, Tower 2, 5th Floor',
    addressLine2: 'Bandra Kurla Complex',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400051',
    isDefault: false,
  }
];

const getMockAddresses = (): Address[] => {
  const stored = localStorage.getItem('mockAddresses');
  return stored ? JSON.parse(stored) : mockAddresses;
};

const getSelectedAddressId = (): string => {
  return localStorage.getItem('selectedAddressId') || 'addr-1';
};

export function AddressesPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>(getMockAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(getSelectedAddressId);
  
  const saveAddressesToStorage = (newAddresses: Address[]) => {
    setAddresses(newAddresses);
    localStorage.setItem('mockAddresses', JSON.stringify(newAddresses));
  };

  const saveSelectedAddressIdToStorage = (id: string) => {
    setSelectedAddressId(id);
    localStorage.setItem('selectedAddressId', id);
  };
  
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  
  const [form] = Form.useForm();

  const handleEdit = (addr: Address, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAddress(addr);
    form.setFieldsValue(addr);
    setIsDrawerVisible(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: 'Delete Address',
      content: 'Are you sure you want to delete this address?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        const newAddrs = addresses.filter(a => a.id !== id);
        saveAddressesToStorage(newAddrs);
        if (selectedAddressId === id) {
          saveSelectedAddressIdToStorage(newAddrs.length > 0 ? newAddrs[0].id : '');
        }
        message.success('Address deleted successfully');
      }
    });
  };

  const handleAddNew = () => {
    setEditingAddress(null);
    form.resetFields();
    setIsDrawerVisible(true);
  };

  const handleSave = (values: any) => {
    if (editingAddress) {
      // Update existing
      const newAddrs = addresses.map(a => a.id === editingAddress.id ? { ...a, ...values } : a);
      saveAddressesToStorage(newAddrs);
      message.success('Address updated successfully');
    } else {
      // Add new
      const newAddr = {
        ...values,
        id: `addr-${Date.now()}`,
      };
      const newAddrs = [...addresses, newAddr];
      saveAddressesToStorage(newAddrs);
      saveSelectedAddressIdToStorage(newAddr.id); // Auto select new address
      message.success('Address added successfully');
    }
    setIsDrawerVisible(false);
  };

  const handleSelect = (id: string) => {
    saveSelectedAddressIdToStorage(id);
    message.success('Delivery address updated');
    // Navigate back to cart
    setTimeout(() => {
       navigate('/cart');
    }, 500);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      {/* Header */}
      <header
        style={{
          background: '#fff',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 16 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>Select Address</Typography.Text>
      </header>

      {/* Address List */}
      <div style={{ padding: '16px' }}>
        <Typography.Text strong style={{ display: 'block', fontSize: 14, color: '#878787', marginBottom: 12 }}>
          SAVED ADDRESSES
        </Typography.Text>

        {addresses.map(addr => (
          <div 
            key={addr.id}
            onClick={() => handleSelect(addr.id)}
            style={{ 
              background: selectedAddressId === addr.id ? '#fff3ed' : '#fff', 
              border: `1px solid ${selectedAddressId === addr.id ? '#f97316' : '#e0e0e0'}`,
              borderRadius: 8, 
              padding: 16, 
              marginBottom: 12,
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio checked={selectedAddressId === addr.id} style={{ marginRight: 0 }} />
                <Typography.Text strong style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#475569' }}>
                  {addr.type}
                </Typography.Text>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <EditOutlined style={{ color: '#f97316', fontSize: 18 }} onClick={(e) => handleEdit(addr, e)} />
                <DeleteOutlined style={{ color: '#878787', fontSize: 18 }} onClick={(e) => handleDelete(addr.id, e)} />
              </div>
            </div>
            
            <div style={{ paddingLeft: 28 }}>
               <Typography.Text strong style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
                 {addr.name}
               </Typography.Text>
               <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242', lineHeight: 1.5 }}>
                 {addr.addressLine1}, {addr.addressLine2}<br />
                 {addr.city}, {addr.state} - {addr.pincode}
               </Typography.Text>
               <Typography.Text style={{ display: 'block', fontSize: 13, color: '#424242', marginTop: 4 }}>
                 Phone: <Typography.Text strong>{addr.phone}</Typography.Text>
               </Typography.Text>
            </div>
          </div>
        ))}

        <Button 
          type="dashed" 
          block 
          icon={<PlusOutlined />} 
          style={{ height: 50, color: '#f97316', borderColor: '#f97316', background: '#fff' }}
          onClick={handleAddNew}
        >
          Add New Address
        </Button>
      </div>

      {/* Add/Edit Drawer */}
      <Drawer
        title={editingAddress ? "Edit Address" : "Add New Address"}
        placement="bottom"
        onClose={() => setIsDrawerVisible(false)}
        open={isDrawerVisible}
        height="85vh"
        styles={{ header: { padding: '16px' }, body: { padding: '16px' } }}
        footer={
          <div style={{ padding: '8px 16px' }}>
            <Button type="primary" block size="large" style={{ background: '#f97316', borderColor: '#f97316' }} onClick={() => form.submit()}>
              Save Address
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>Contact Details</Typography.Text>
          <Form.Item name="name" rules={[{ required: true, message: 'Please enter name' }]}>
            <Input placeholder="Full Name" size="large" />
          </Form.Item>
          <Form.Item name="phone" rules={[{ required: true, message: 'Please enter phone number' }]}>
            <Input placeholder="Phone Number" size="large" type="tel" />
          </Form.Item>
          
          <Divider style={{ margin: '16px 0' }} />
          
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>Address Details</Typography.Text>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item name="pincode" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Pincode" size="large" type="number" />
            </Form.Item>
            <Form.Item name="city" style={{ flex: 1 }} rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="City" size="large" />
            </Form.Item>
          </div>
          <Form.Item name="state" rules={[{ required: true, message: 'Required' }]}>
             <Input placeholder="State" size="large" />
          </Form.Item>
          <Form.Item name="addressLine1" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="House No, Building Name" size="large" />
          </Form.Item>
          <Form.Item name="addressLine2" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Road Name, Area, Colony" size="large" />
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>Save Address As</Typography.Text>
          <Form.Item name="type" initialValue="Home">
            <Radio.Group style={{ width: '100%', display: 'flex', gap: 12 }}>
              <Radio.Button value="Home" style={{ flex: 1, textAlign: 'center', borderRadius: 8 }}>Home</Radio.Button>
              <Radio.Button value="Office" style={{ flex: 1, textAlign: 'center', borderRadius: 8 }}>Office</Radio.Button>
              <Radio.Button value="Other" style={{ flex: 1, textAlign: 'center', borderRadius: 8 }}>Other</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
