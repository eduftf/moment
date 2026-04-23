use std::sync::atomic::{AtomicU8, Ordering};

#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarState {
    Starting = 0,
    Ready = 1,
    Backoff = 2,
    Dead = 3,
}

impl SidecarState {
    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Starting,
            1 => Self::Ready,
            2 => Self::Backoff,
            _ => Self::Dead,
        }
    }
}

#[derive(Debug, Default)]
pub struct SidecarStateCell(AtomicU8);

impl SidecarStateCell {
    pub fn load(&self) -> SidecarState {
        SidecarState::from_u8(self.0.load(Ordering::SeqCst))
    }
    pub fn store(&self, s: SidecarState) {
        self.0.store(s as u8, Ordering::SeqCst);
    }
}
