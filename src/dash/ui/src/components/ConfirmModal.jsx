import { Modal, Text, Group, Button } from '@mantine/core';

export default function ConfirmModal({ action, onClose }) {
  if (!action) return null;
  return (
    <Modal opened={!!action} onClose={onClose} title={action.title} size="sm" centered>
      <Text size="sm">{action.message}</Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color={action.color ?? 'blue'}
          loading={action.loading}
          onClick={() => {
            onClose();
            action.onConfirm();
          }}
        >
          {action.confirmLabel ?? 'Confirm'}
        </Button>
      </Group>
    </Modal>
  );
}
